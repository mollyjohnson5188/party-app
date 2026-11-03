/**
 * 保证金支付服务 —— 资金唯一入口。
 *
 * 设计铁律：
 *  1. 所有"只许成功一次"的判定，一律靠数据库影响行数 / 唯一约束，
 *     绝不靠先 SELECT 再 if 判断（并发下必然重复入账）。
 *  2. 每一次与通道交互都先写 payment_attempt（幂等键唯一），
 *     拿到"本次是首次处理"的权利后才允许改状态、调通道。
 *  3. 审计与业务同事务。
 */
import { PoolClient } from 'pg';
import { withTransaction, queryOne, isUniqueViolation } from '@/lib/db';
import { Err } from '@/lib/errors';
import { newId } from '@/lib/id';
import { getClock, MAX_RETRY, RETRY_INTERVAL, addMs } from '@/lib/clock';
import { auditIn } from './audit.service';
import type { PayChannel } from './pay-channel';

export interface PayNotifyPayload {
  orderId: string;
  registrationId: string;
  channelTxnId: string;
  channelEventId: string;
  amount: number;
  paidAt: string;
}

export interface NotifyResult {
  idempotent: boolean;
  orderStatus: string;
}

export interface OrderRow {
  id: string;
  registration_id: string;
  amount: number;
  status: string;
  channel_hold_id: string | null;
  retry_count: number;
  payment_channel: string;
}

export class GuaranteePaymentService {
  constructor(private readonly channel: PayChannel) {}

  get channelName(): string {
    return this.channel.name;
  }

  // -------------------------------------------------------------------------
  // 支付成功回调
  // -------------------------------------------------------------------------
  async handlePaySuccessNotify(p: PayNotifyPayload): Promise<NotifyResult> {
    return withTransaction(async (c) => {
      const order = (
        await c.query<OrderRow>('SELECT * FROM guarantee_order WHERE id=$1 FOR UPDATE', [
          p.orderId,
        ])
      ).rows[0];
      if (!order) throw Err.orderNotFound(p.orderId);

      // 金额校验先于一切写入
      if (Number(order.amount) !== p.amount) {
        await auditIn(c, {
          entityType: 'guarantee_order',
          entityId: p.orderId,
          action: 'PAY_NOTIFY_REJECT',
          reason: `金额不一致 expected=${order.amount} actual=${p.amount}`,
          operatorType: 'SYSTEM',
          paymentRef: p.channelTxnId,
        });
        throw Err.amountMismatch(Number(order.amount), p.amount);
      }

      // 幂等：抢占 payment_attempt 唯一键。抢不到说明已处理过。
      const claimed = await this.claimAttempt(c, {
        orderId: p.orderId,
        kind: 'HOLD',
        idempotencyKey: `HOLD:${p.registrationId}`,
        channelTxnId: p.channelTxnId,
        channelEventId: p.channelEventId,
        amount: p.amount,
        status: 'SUCCESS',
      });
      if (!claimed) {
        return { idempotent: true, orderStatus: order.status };
      }

      // 拿到权利后，用 CAS 推进状态；影响行数为 0 说明别处已推进
      const moved = await c.query(
        `UPDATE guarantee_order
            SET status='HELD', channel_hold_id=COALESCE(channel_hold_id,$1),
                held_at=COALESCE(held_at,$2), updated_at=now()
          WHERE id=$3 AND status='PAYING'`,
        [p.channelTxnId, p.paidAt, p.orderId]
      );

      if (moved.rowCount === 0) {
        return { idempotent: true, orderStatus: order.status };
      }

      await c.query(
        `UPDATE registration
            SET registration_status='CONFIRMED', updated_at=now()
          WHERE id=$1 AND registration_status='PENDING_PAYMENT'`,
        [p.registrationId]
      );

      await auditIn(c, {
        entityType: 'guarantee_order',
        entityId: p.orderId,
        action: 'PAY_HOLD_SUCCESS',
        fromState: 'PAYING',
        toState: 'HELD',
        operatorType: 'SYSTEM',
        paymentRef: p.channelTxnId,
      });

      await c.query(
        `INSERT INTO notification(user_id, type, payload)
         SELECT user_id, 'REGISTRATION_SUCCESS', $2 FROM registration WHERE id=$1`,
        [p.registrationId, JSON.stringify({ orderId: p.orderId })]
      );

      return { idempotent: false, orderStatus: 'HELD' };
    });
  }

  /**
   * 抢占支付流水幂等键。
   * 返回 true = 本次是首次处理，有权继续；false = 已处理过。
   */
  private async claimAttempt(
    c: PoolClient,
    input: {
      orderId: string;
      kind: 'HOLD' | 'RELEASE' | 'FORFEIT';
      idempotencyKey: string;
      channelTxnId?: string | null;
      channelEventId?: string | null;
      amount: number;
      status: 'PENDING' | 'SUCCESS' | 'FAILED';
      errorCode?: string | null;
      errorMessage?: string | null;
    }
  ): Promise<boolean> {
    try {
      // 注意：企图在同一语句里用 $2/$3 既做 VALUES 又做子查询参数会导致
      // PostgreSQL "inconsistent types deduced for parameter" 错误，
      // 故 attempt_no 单独查一次（在 FOR UPDATE 的串行化范围内已足够）。
      const nextNo = (
        await c.query<{ n: string }>(
          `SELECT COALESCE(MAX(attempt_no),0)+1 AS n FROM payment_attempt
            WHERE guarantee_order_id=$1 AND kind=$2`,
          [input.orderId, input.kind]
        )
      ).rows[0].n;

      await c.query(
        `INSERT INTO payment_attempt(
           id, guarantee_order_id, kind, attempt_no, channel,
           channel_txn_id, channel_event_id, idempotency_key, amount,
           status, error_code, error_message
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          newId('pa'),
          input.orderId,
          input.kind,
          Number(nextNo),
          this.channel.name,
          input.channelTxnId ?? null,
          input.channelEventId ?? null,
          input.idempotencyKey,
          input.amount,
          input.status,
          input.errorCode ?? null,
          input.errorMessage ?? null,
        ]
      );
      return true;
    } catch (e) {
      if (isUniqueViolation(e)) return false;
      throw e;
    }
  }

  // -------------------------------------------------------------------------
  // 核销成功 -> 发起退款
  // -------------------------------------------------------------------------
  async releaseOnCheckin(registrationId: string, operatorId: string): Promise<void> {
    const order = await queryOne<OrderRow>(
      'SELECT * FROM guarantee_order WHERE registration_id=$1',
      [registrationId]
    );
    if (!order) return; // 免费占位，无保证金
    await this.releaseOrder(order.id, 'CHECKIN', operatorId);
  }

  /**
   * 发起全额退款。幂等键固定为 RELEASE:{orderId}，保证同一单只退一次。
   * 退款失败不抛错给调用方（核销响应不能被退款阻塞），转重试。
   */
  async releaseOrder(
    orderId: string,
    reason: 'CHECKIN' | 'USER_CANCEL' | 'ACTIVITY_CANCEL' | 'NO_ONE_ATTENDED' | 'APPEAL',
    operatorId?: string
  ): Promise<{ released: boolean; alreadyDone: boolean; failed: boolean }> {
    return withTransaction(async (c) => {
      const order = (
        await c.query<OrderRow>('SELECT * FROM guarantee_order WHERE id=$1 FOR UPDATE', [
          orderId,
        ])
      ).rows[0];
      if (!order) throw Err.orderNotFound(orderId);

      if (order.status === 'RELEASED') {
        return { released: true, alreadyDone: true, failed: false };
      }
      if (!['HELD', 'FORFEIT_PENDING', 'FORFEITED', 'RELEASING'].includes(order.status)) {
        return { released: false, alreadyDone: true, failed: false };
      }

      // 幂等键分两段：
      //  - 首次发起用 RELEASE:{orderId}，保证"同一单只发起一次"
      //  - 重试（状态已是 RELEASING）用 RELEASE:{orderId}:{retry_count}，
      //    否则幂等键会被自己拦住，重试永远不可能成功。
      const isRetry = order.status === 'RELEASING' && order.retry_count > 0;
      const idemKey = isRetry
        ? `RELEASE:${orderId}:${order.retry_count}`
        : `RELEASE:${orderId}`;

      const claimed = await this.claimAttempt(c, {
        orderId,
        kind: 'RELEASE',
        idempotencyKey: idemKey,
        amount: Number(order.amount),
        status: 'PENDING',
      });

      if (!claimed) {
        const cur = await queryOne<{ status: string }>(
          'SELECT status FROM guarantee_order WHERE id=$1',
          [orderId]
        );
        return {
          released: cur?.status === 'RELEASED',
          alreadyDone: true,
          failed: cur?.status === 'FAILED',
        };
      }

      await c.query(
        `UPDATE guarantee_order
            SET status='RELEASING', updated_at=now()
          WHERE id=$1 AND status IN ('HELD','FORFEIT_PENDING','FORFEITED')`,
        [orderId]
      );

      const result = await this.channel.release({
        bizId: idemKey,
        holdId: order.channel_hold_id ?? '',
        amount: Number(order.amount),
        reason,
      });

      if (result.success) {
        const now = getClock().now().toISOString();
        await c.query(
          `UPDATE guarantee_order
              SET status='RELEASED', release_id=$1, released_at=$2,
                  last_error=NULL, updated_at=now()
            WHERE id=$3`,
          [result.channelTxnId, now, orderId]
        );
        await c.query(
          `UPDATE payment_attempt
              SET status='SUCCESS', channel_txn_id=$1, updated_at=now()
            WHERE guarantee_order_id=$2 AND kind='RELEASE'
              AND idempotency_key=$3 AND status='PENDING'`,
          [result.channelTxnId, orderId, idemKey]
        );
        await auditIn(c, {
          entityType: 'guarantee_order',
          entityId: orderId,
          action: 'RELEASE_SUCCESS',
          fromState: 'RELEASING',
          toState: 'RELEASED',
          reason,
          operatorType: 'SYSTEM',
          operatorId: operatorId ?? null,
          paymentRef: result.channelTxnId ?? null,
        });
        return { released: true, alreadyDone: false, failed: false };
      }

      const retry = order.retry_count + 1;
      const failed = retry >= MAX_RETRY;
      const nextAt = addMs(getClock().now(), RETRY_INTERVAL).toISOString();
      await c.query(
        `UPDATE guarantee_order
            SET status=$1, retry_count=$2, next_retry_at=$3,
                last_error=$4, updated_at=now()
          WHERE id=$5`,
        [
          failed ? 'FAILED' : 'RELEASING',
          retry,
          failed ? null : nextAt,
          result.errorMessage ?? result.errorCode ?? 'unknown',
          orderId,
        ]
      );
      await c.query(
        `UPDATE payment_attempt
            SET status='FAILED', error_code=$1, error_message=$2, updated_at=now()
          WHERE guarantee_order_id=$3 AND kind='RELEASE'
            AND idempotency_key=$4 AND status='PENDING'`,
        [result.errorCode ?? 'UNKNOWN', result.errorMessage ?? null, orderId, idemKey]
      );
      await auditIn(c, {
        entityType: 'guarantee_order',
        entityId: orderId,
        action: failed ? 'RELEASE_FAILED_FINAL' : 'RELEASE_RETRY_SCHEDULED',
        fromState: 'RELEASING',
        toState: failed ? 'FAILED' : 'RELEASING',
        reason: result.errorMessage ?? result.errorCode,
        operatorType: 'SYSTEM',
        extra: { retry },
      });
      return { released: false, alreadyDone: false, failed };
    });
  }

  // -------------------------------------------------------------------------
  // 爽约扣划：全进补偿专户，平台不截留
  // -------------------------------------------------------------------------
  async forfeitOrder(
    orderId: string,
    activityId: string,
    reason: string
  ): Promise<{ forfeited: boolean; alreadyDone: boolean }> {
    return withTransaction(async (c) => {
      const order = (
        await c.query<OrderRow>('SELECT * FROM guarantee_order WHERE id=$1 FOR UPDATE', [
          orderId,
        ])
      ).rows[0];
      if (!order) throw Err.orderNotFound(orderId);
      if (order.status === 'FORFEITED') {
        return { forfeited: true, alreadyDone: true };
      }

      const isRetry =
        (order.status === 'FORFEIT_PENDING' && order.retry_count > 0) ||
        order.status === 'RELEASING';
      const idemKey = isRetry
        ? `FORFEIT:${orderId}:${order.retry_count}`
        : `FORFEIT:${orderId}`;

      const claimed = await this.claimAttempt(c, {
        orderId,
        kind: 'FORFEIT',
        idempotencyKey: idemKey,
        amount: Number(order.amount),
        status: 'PENDING',
      });
      if (!claimed) return { forfeited: false, alreadyDone: true };

      await c.query(
        `UPDATE guarantee_order SET status='FORFEIT_PENDING', updated_at=now()
          WHERE id=$1 AND status='HELD'`,
        [orderId]
      );

      const result = await this.channel.forfeit({
        bizId: idemKey,
        holdId: order.channel_hold_id ?? '',
        amount: Number(order.amount),
        payee: {
          type: 'PLATFORM_COMPENSATION',
          accountId: process.env.COMPENSATION_ACCOUNT_ID ?? 'platform_comp',
        },
        reason,
      });

      if (!result.success) {
        const retry = order.retry_count + 1;
        const failed = retry >= MAX_RETRY;
        await c.query(
          `UPDATE guarantee_order
              SET status=$1, retry_count=$2, next_retry_at=$3, last_error=$4, updated_at=now()
            WHERE id=$5`,
          [
            failed ? 'FAILED' : 'FORFEIT_PENDING',
            retry,
            failed ? null : addMs(getClock().now(), RETRY_INTERVAL).toISOString(),
            result.errorMessage ?? result.errorCode,
            orderId,
          ]
        );
        await c.query(
          `UPDATE payment_attempt SET status='FAILED', error_code=$1, error_message=$2, updated_at=now()
            WHERE guarantee_order_id=$3 AND kind='FORFEIT'
              AND idempotency_key=$4 AND status='PENDING'`,
          [result.errorCode ?? 'UNKNOWN', result.errorMessage ?? null, orderId, idemKey]
        );
        return { forfeited: false, alreadyDone: false };
      }

      const now = getClock().now().toISOString();
      await c.query(
        `UPDATE guarantee_order
            SET status='FORFEITED', forfeit_id=$1, forfeited_at=$2, last_error=NULL, updated_at=now()
          WHERE id=$3`,
        [result.channelTxnId, now, orderId]
      );
      await c.query(
        `UPDATE payment_attempt SET status='SUCCESS', channel_txn_id=$1, updated_at=now()
          WHERE guarantee_order_id=$2 AND kind='FORFEIT'
            AND idempotency_key=$3 AND status='PENDING'`,
        [result.channelTxnId, orderId, idemKey]
      );

      await c.query(
        `INSERT INTO compensation_ledger(kind, guarantee_order_id, activity_id, amount, channel_ref, remark)
         VALUES('IN_FORFEIT',$1,$2,$3,$4,$5)`,
        [orderId, activityId, Number(order.amount), result.channelTxnId, reason]
      );

      await auditIn(c, {
        entityType: 'guarantee_order',
        entityId: orderId,
        action: 'FORFEIT_SUCCESS',
        fromState: 'FORFEIT_PENDING',
        toState: 'FORFEITED',
        reason,
        operatorType: 'SYSTEM',
        paymentRef: result.channelTxnId ?? null,
      });
      return { forfeited: true, alreadyDone: false };
    });
  }

  /** 支付超时关单 */
  async cancelUnpaidOrder(orderId: string): Promise<boolean> {
    return withTransaction(async (c) => {
      const moved = await c.query(
        `UPDATE guarantee_order SET status='CANCELLED', updated_at=now()
          WHERE id=$1 AND status IN ('CREATED','PAYING')`,
        [orderId]
      );
      if (moved.rowCount === 0) return false;
      await auditIn(c, {
        entityType: 'guarantee_order',
        entityId: orderId,
        action: 'PAY_TIMEOUT_CANCEL',
        fromState: 'PAYING',
        toState: 'CANCELLED',
        operatorType: 'SYSTEM',
      });
      return true;
    });
  }
}
