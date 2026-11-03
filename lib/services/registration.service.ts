/**
 * 报名服务。
 *
 * 隐藏陷阱：名额并发。若"查人数 -> 判断 < capacity -> 插入"，高并发下会超卖。
 * 解法：对 activity 行加 FOR UPDATE 锁，把同一活动的报名串行化。
 */
import { withTransaction } from '@/lib/db';
import { Err } from '@/lib/errors';
import { newId } from '@/lib/id';
import { getClock, PAYMENT_TIMEOUT, addMs } from '@/lib/clock';
import { auditIn } from './audit.service';
import { buildCheckinMaterial } from '@/lib/checkin-code';
import { CreditService, SCORE_BASE } from './credit.service';

export interface CreateRegistrationInput {
  activityId: string;
  userId: string;
  guaranteeMode?: 'NONE' | 'GUARANTEE';
}

export interface CreateRegistrationResult {
  id: string;
  registrationStatus: string;
  guaranteeOrderId: string | null;
  guaranteeAmount: number;
  paymentExpireAt: string | null;
  checkinCode?: string;
}

export class RegistrationService {
  private readonly credit = new CreditService();

  constructor(private readonly payment?: unknown) {}

  async create(input: CreateRegistrationInput): Promise<CreateRegistrationResult> {
    const now = getClock().now();

    return withTransaction(async (c) => {
      // 锁活动行，串行化同活动报名，杜绝超卖
      const act = (
        await c.query<{
          id: string;
          host_id: string;
          start_at: Date;
          status: string;
          capacity: number;
          guarantee_mode: 'NONE' | 'GUARANTEE';
          guarantee_amount: number;
          min_credit_score: number;
        }>(
          `SELECT id, host_id, start_at, status, capacity,
                  guarantee_mode, guarantee_amount, min_credit_score
             FROM activity WHERE id=$1 FOR UPDATE`,
          [input.activityId]
        )
      ).rows[0];

      if (!act) throw Err.activityNotFound(input.activityId);
      if (act.status === 'CANCELLED') throw Err.activityCancelled();
      if (act.status !== 'PUBLISHED') throw Err.validation('活动当前不可报名');
      if (act.host_id === input.userId) throw Err.cannotRegisterOwn();
      if (now.getTime() >= new Date(act.start_at).getTime()) {
        throw Err.validation('活动已开始，无法报名');
      }

      // 信用门槛
      const acct = (
        await c.query<{ score: number }>(
          'SELECT score FROM credit_account WHERE user_id=$1',
          [input.userId]
        )
      ).rows[0];
      const score = acct?.score ?? SCORE_BASE;
      if (score < act.min_credit_score) {
        throw Err.creditBelowThreshold(act.min_credit_score, score);
      }

      // 名额
      const occupied = (
        await c.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM registration
            WHERE activity_id=$1
              AND registration_status IN ('PENDING_PAYMENT','CONFIRMED','CHECKED_IN','NO_SHOW')`,
          [input.activityId]
        )
      ).rows[0];
      if (Number(occupied.c) >= act.capacity) throw Err.activityFull();

      // 保证金额度以活动配置为准，不接受客户端传值
      const mode = input.guaranteeMode ?? act.guarantee_mode;
      const amount = mode === 'GUARANTEE' ? Number(act.guarantee_amount) : 0;
      if (mode === 'GUARANTEE' && amount <= 0) {
        throw Err.validation('该活动未正确配置保证金金额');
      }

      const regId = newId('reg');
      const material = buildCheckinMaterial({
        activityId: act.id,
        registrationId: regId,
        startAt: new Date(act.start_at),
      });

      const payExpire = mode === 'GUARANTEE' ? addMs(now, PAYMENT_TIMEOUT) : null;

      try {
        await c.query(
          `INSERT INTO registration(
             id, activity_id, user_id, host_id, registration_status,
             guarantee_mode, guarantee_amount, checkin_status,
             checkin_code_hash, checkin_code_cipher, checkin_code_expire_at,
             payment_expire_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,'UNUSED',$8,$9,$10,$11)`,
          [
            regId,
            act.id,
            input.userId,
            act.host_id,
            mode === 'GUARANTEE' ? 'PENDING_PAYMENT' : 'CONFIRMED',
            mode,
            amount,
            material.tokenHash,
            material.codeCipher,
            material.expireAt.toISOString(),
            payExpire ? payExpire.toISOString() : null,
          ]
        );
      } catch (e) {
        // 部分唯一索引 uq_reg_active 兜底重复报名
        if ((e as { code?: string }).code === '23505') throw Err.duplicateRegistration();
        throw e;
      }

      let orderId: string | null = null;
      if (mode === 'GUARANTEE') {
        orderId = newId('go');
        await c.query(
          `INSERT INTO guarantee_order(id, registration_id, amount, status, payment_channel)
           VALUES ($1,$2,$3,'PAYING','mock')`,
          [orderId, regId, amount]
        );
      }

      await auditIn(c, {
        entityType: 'registration',
        entityId: regId,
        action: 'CREATE_REGISTRATION',
        toState: mode === 'GUARANTEE' ? 'PENDING_PAYMENT' : 'CONFIRMED',
        operatorType: 'USER',
        operatorId: input.userId,
        extra: { mode, amount },
      });

      return {
        id: regId,
        registrationStatus: mode === 'GUARANTEE' ? 'PENDING_PAYMENT' : 'CONFIRMED',
        guaranteeOrderId: orderId,
        guaranteeAmount: amount,
        paymentExpireAt: payExpire ? payExpire.toISOString() : null,
        checkinCode: material.code,
      };
    });
  }

  /**
   * 用户取消报名。
   * 时间窗口：
   *   now >= T0               -> 拒绝（活动已开始）
   *   now >  T0 - 12h         -> 扣 2 分（迟到取消）
   *   now <= T0 - 12h         -> 不扣分
   */
  async cancelByUser(input: {
    registrationId: string;
    userId: string;
    reason?: string;
  }): Promise<{ cancelled: boolean; lateCancel: boolean; refundTriggered: boolean }> {
    const now = getClock().now();

    return withTransaction(async (c) => {
      const reg = (
        await c.query<{
          id: string;
          user_id: string;
          activity_id: string;
          registration_status: string;
          guarantee_amount: number;
          start_at: Date;
        }>(
          `SELECT r.id, r.user_id, r.activity_id, r.registration_status,
                  r.guarantee_amount, a.start_at
             FROM registration r JOIN activity a ON a.id = r.activity_id
            WHERE r.id=$1 FOR UPDATE OF r`,
          [input.registrationId]
        )
      ).rows[0];

      if (!reg) throw Err.registrationNotFound(input.registrationId);
      if (reg.user_id !== input.userId) throw Err.notOwner();

      const startAt = new Date(reg.start_at);
      if (now.getTime() >= startAt.getTime()) throw Err.startedCannotCancel();

      if (!['CONFIRMED', 'PENDING_PAYMENT'].includes(reg.registration_status)) {
        return { cancelled: false, lateCancel: false, refundTriggered: false };
      }

      const moved = await c.query(
        `UPDATE registration
            SET registration_status='CANCELLED_BY_USER',
                checkin_status='UNUSED',
                cancelled_at=$1, cancel_reason=$2, updated_at=now()
          WHERE id=$3 AND registration_status IN ('CONFIRMED','PENDING_PAYMENT')`,
        [now.toISOString(), input.reason ?? '用户取消', input.registrationId]
      );
      if (moved.rowCount === 0) {
        return { cancelled: false, lateCancel: false, refundTriggered: false };
      }

      const lateCancel = now.getTime() > startAt.getTime() - 12 * 3_600_000;

      await auditIn(c, {
        entityType: 'registration',
        entityId: reg.id,
        action: 'CANCEL_BY_USER',
        fromState: reg.registration_status,
        toState: 'CANCELLED_BY_USER',
        reason: input.reason ?? null,
        operatorType: 'USER',
        operatorId: input.userId,
        extra: { lateCancel },
      });

      return { cancelled: true, lateCancel, refundTriggered: reg.guarantee_amount > 0 };
    }).then(async (r) => {
      // 事务外触发退款与信用（各自独立事务，避免长事务）
      if (r.cancelled && r.refundTriggered) {
        const { GuaranteePaymentService } = await import('./guarantee-payment.service');
        const { getDefaultChannel } = await import('./pay-channel.registry');
        const svc = new GuaranteePaymentService(getDefaultChannel());
        const { queryOne } = await import('@/lib/db');
        const order = await queryOne<{ id: string }>(
          'SELECT id FROM guarantee_order WHERE registration_id=$1',
          [input.registrationId]
        );
        if (order) {
          await svc
            .releaseOrder(order.id, 'USER_CANCEL', input.userId)
            .catch((e) => console.error('[cancel] 退款异常', e));
        }
      }
      if (r.cancelled && r.lateCancel) {
        await this.credit
          .apply(input.registrationId, input.userId, 'LATE_CANCEL', {
            reason: 'T0-12h 内取消',
            operator: 'SYSTEM',
          })
          .catch((e) => console.error('[cancel] 信用扣分异常', e));
      }
      return r;
    });
  }
}
