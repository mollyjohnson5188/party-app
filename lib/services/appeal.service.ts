/**
 * 申诉服务。
 *
 * 关键约束（规程 2.6 / 3.3）：
 *  - 活动结束后 24 小时内可申诉，一个报名单只能申诉一次
 *  - 通过后：NO_SHOW -> CHECKED_IN，保证金回滚，信用加回
 *  - 同一报名单只允许回滚一次 —— 由 credit_ledger 的
 *    (registration_id, APPEAL_REVERT) 唯一索引兜底，不靠应用层判断
 *  - 已扣划（FORFEITED）的保证金：优先从补偿专户反向退，记 PLATFORM_ADVANCE
 *    或 OUT_REFUND_ON_APPEAL
 */
import { withTransaction, query, queryOne } from '@/lib/db';
import { Err } from '@/lib/errors';
import { getClock, APPEAL_WINDOW } from '@/lib/clock';
import { newId } from '@/lib/id';
import { auditIn } from '@/lib/services/audit.service';
import { CreditService } from '@/lib/services/credit.service';
import { GuaranteePaymentService } from '@/lib/services/guarantee-payment.service';
import { getDefaultChannel } from '@/lib/services/pay-channel.registry';

export interface AppealSubmitResult {
  id: string;
  status: string;
  expireAt: string;
}

export interface AppealReviewResult {
  appealId: string;
  status: 'APPROVED' | 'REJECTED';
  creditReverted: boolean;
  guaranteeRefunded: boolean;
  reimbursementMode: 'POOL_REVERSE' | 'PLATFORM_ADVANCE' | 'NOT_FORFEITED' | 'NONE';
}

export class AppealService {
  private readonly credit = new CreditService();

  constructor(private readonly payment?: GuaranteePaymentService) {}

  private get pmt(): GuaranteePaymentService {
    return this.payment ?? new GuaranteePaymentService(getDefaultChannel());
  }

  async submit(input: {
    registrationId: string;
    userId: string;
    statement: string;
    evidenceUrls?: string[];
  }): Promise<AppealSubmitResult> {
    const now = getClock().now();

    return withTransaction(async (c) => {
      const reg = (
        await c.query<{
          id: string;
          user_id: string;
          activity_id: string;
          registration_status: string;
          checkin_status: string;
          end_at: Date;
        }>(
          `SELECT r.id, r.user_id, r.activity_id, r.registration_status,
                  r.checkin_status, a.end_at
             FROM registration r JOIN activity a ON a.id=r.activity_id
            WHERE r.id=$1`,
          [input.registrationId]
        )
      ).rows[0];

      if (!reg) throw Err.registrationNotFound(input.registrationId);
      if (reg.user_id !== input.userId) throw Err.notOwner();
      if (reg.checkin_status !== 'NO_SHOW' && reg.registration_status !== 'NO_SHOW') {
        throw Err.notAppealable();
      }

      const expireAt = new Date(new Date(reg.end_at).getTime() + APPEAL_WINDOW);
      if (now.getTime() > expireAt.getTime()) throw Err.appealWindowClosed();

      const exist = await c.query(
        'SELECT 1 FROM appeal WHERE registration_id=$1',
        [input.registrationId]
      );
      if ((exist.rowCount ?? 0) > 0) throw Err.appealExists();

      const id = newId('ap');
      await c.query(
        `INSERT INTO appeal(id, registration_id, user_id, status, evidence_urls, statement, expire_at)
         VALUES($1,$2,$3,'SUBMITTED',$4,$5,$6)`,
        [
          id,
          input.registrationId,
          input.userId,
          JSON.stringify(input.evidenceUrls ?? []),
          input.statement,
          expireAt.toISOString(),
        ]
      );

      await auditIn(c, {
        entityType: 'appeal',
        entityId: id,
        action: 'SUBMIT_APPEAL',
        toState: 'SUBMITTED',
        operatorType: 'USER',
        operatorId: input.userId,
      });

      return { id, status: 'SUBMITTED', expireAt: expireAt.toISOString() };
    });
  }

  async review(input: {
    appealId: string;
    adminId: string;
    approved: boolean;
    note?: string;
  }): Promise<AppealReviewResult> {
    const now = getClock().now();

    const base = await withTransaction(async (c) => {
      const ap = (
        await c.query<{
          id: string;
          registration_id: string;
          user_id: string;
          status: string;
          activity_id: string;
        }>(
          `SELECT ap.id, ap.registration_id, ap.user_id, ap.status, r.activity_id
             FROM appeal ap JOIN registration r ON r.id = ap.registration_id
            WHERE ap.id=$1 FOR UPDATE`,
          [input.appealId]
        )
      ).rows[0];

      if (!ap) throw Err.appealNotFound();

      // 管理员账户可能不在 app_user（独立后台），补占位以满足 FK
      await c.query(
        `INSERT INTO app_user(id, nickname) VALUES($1,$2) ON CONFLICT (id) DO NOTHING`,
        [input.adminId, `管理员${input.adminId}`]
      );
      if (ap.status !== 'SUBMITTED') {
        // 已审过，幂等返回
        return { ap, already: true as const };
      }

      if (!input.approved) {
        await c.query(
          `UPDATE appeal SET status='REJECTED', review_note=$1, reviewed_by=$2,
                  reviewed_at=now(), updated_at=now()
            WHERE id=$3`,
          [input.note ?? null, input.adminId, input.appealId]
        );
        await auditIn(c, {
          entityType: 'appeal',
          entityId: ap.id,
          action: 'REVIEW_APPEAL_REJECT',
          fromState: 'SUBMITTED',
          toState: 'REJECTED',
          reason: input.note ?? null,
          operatorType: 'ADMIN',
          operatorId: input.adminId,
        });
        return { ap, already: false as const, rejected: true };
      }

      // 通过：报名单 → CHECKED_IN（从 NO_SHOW 恢复）
      const moved = await c.query(
        `UPDATE registration
            SET checkin_status='CHECKED_IN',
                registration_status='CHECKED_IN',
                checkin_at=COALESCE(checkin_at,$1),
                updated_at=now()
          WHERE id=$2 AND (checkin_status='NO_SHOW' OR registration_status='NO_SHOW')`,
        [now.toISOString(), ap.registration_id]
      );

      await c.query(
        `UPDATE appeal SET status='APPROVED', review_note=$1, reviewed_by=$2,
                reviewed_at=now(), updated_at=now()
          WHERE id=$3`,
        [input.note ?? null, input.adminId, input.appealId]
      );

      await auditIn(c, {
        entityType: 'appeal',
        entityId: ap.id,
        action: 'REVIEW_APPEAL_APPROVE',
        fromState: 'SUBMITTED',
        toState: 'APPROVED',
        reason: input.note ?? null,
        operatorType: 'ADMIN',
        operatorId: input.adminId,
        extra: { registrationAffected: moved.rowCount },
      });

      return { ap, already: false as const, rejected: false };
    });

    if (base.already) {
      const cur = await queryOne<{ status: string }>(
        'SELECT status FROM appeal WHERE id=$1',
        [input.appealId]
      );
      return {
        appealId: input.appealId,
        status: (cur?.status as 'APPROVED' | 'REJECTED') ?? 'REJECTED',
        creditReverted: false,
        guaranteeRefunded: false,
        reimbursementMode: 'NONE',
      };
    }

    if ('rejected' in base && base.rejected) {
      return {
        appealId: input.appealId,
        status: 'REJECTED',
        creditReverted: false,
        guaranteeRefunded: false,
        reimbursementMode: 'NONE',
      };
    }

    const regId = base.ap.registration_id;

    // 信用加回：按原 NO_SHOW 的 nominal_delta 反向（原样撤销），唯一约束保证只加一次
    let creditReverted = false;
    const orig = await queryOne<{ nominal_delta: number }>(
      `SELECT nominal_delta FROM credit_ledger
        WHERE registration_id=$1 AND event_type='NO_SHOW'`,
      [regId]
    );
    if (orig) {
      const revertDelta = -Number(orig.nominal_delta);
      const res = await this.credit.apply(regId, base.ap.user_id, 'APPEAL_REVERT', {
        nominalDelta: revertDelta,
        reason: '申诉通过，撤销爽约扣分',
        operator: `ADMIN:${input.adminId}`,
      });
      creditReverted = !res.alreadyProcessed;
    }

    // 保证金回滚
    let guaranteeRefunded = false;
    let mode: AppealReviewResult['reimbursementMode'] = 'NONE';
    const order = await queryOne<{ id: string; status: string; amount: number }>(
      'SELECT id, status, amount FROM guarantee_order WHERE registration_id=$1',
      [regId]
    );

    if (order) {
      if (order.status === 'HELD') {
        const r = await this.pmt.releaseOrder(order.id, 'APPEAL', input.adminId);
        guaranteeRefunded = r.released || r.alreadyDone;
        mode = 'NOT_FORFEITED';
      } else if (order.status === 'FORFEITED' || order.status === 'FORFEIT_PENDING') {
        // 已扣划：从补偿专户反向出账；余额不足则平台垫付
        const pool = await queryOne<{ balance: string }>(
          `SELECT COALESCE(SUM(amount),0)::text AS balance
             FROM compensation_ledger WHERE kind IN ('IN_FORFEIT','PLATFORM_ADVANCE','OUT_REFUND_ON_APPEAL')`,
        );
        const balance = Number(pool?.balance ?? 0);
        const useAdvance = balance < Number(order.amount);
        mode = useAdvance ? 'PLATFORM_ADVANCE' : 'POOL_REVERSE';

        await withTransaction(async (c) => {
          await c.query(
            `INSERT INTO compensation_ledger(
               kind, guarantee_order_id, activity_id, registration_id, amount, remark
             ) VALUES ($1,$2,$3,$4,$5,$6)`,
            [
              useAdvance ? 'PLATFORM_ADVANCE' : 'OUT_REFUND_ON_APPEAL',
              order.id,
              base.ap.activity_id,
              regId,
              useAdvance ? Number(order.amount) : -Number(order.amount),
              useAdvance ? '专户余额不足，平台垫付退还' : '申诉回滚，从补偿专户退还',
            ]
          );
          await auditIn(c, {
            entityType: 'guarantee_order',
            entityId: order.id,
            action: 'APPEAL_REFUND_FROM_POOL',
            reason: useAdvance ? '平台垫付' : '专户反退',
            operatorType: 'ADMIN',
            operatorId: input.adminId,
            extra: { mode },
          });
        });

        const r = await this.pmt.releaseOrder(order.id, 'APPEAL', input.adminId);
        guaranteeRefunded = r.released || r.alreadyDone;
      }
    }

    return {
      appealId: input.appealId,
      status: 'APPROVED',
      creditReverted,
      guaranteeRefunded,
      reimbursementMode: mode,
    };
  }
}

