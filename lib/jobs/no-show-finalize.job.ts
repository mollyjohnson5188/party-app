/**
 * noShowFinalizeJob：每 5 分钟扫描 T0+120min 已到的 NO_SHOW_CANDIDATE，
 * 置 NO_SHOW、扣信用、触发保证金扣划与分账。
 *
 * 这是全系统最易出错的地方（规程明确点名）。
 * 幂等保证：
 *  1) UPDATE ... WHERE checkin_status='NO_SHOW_CANDIDATE' 的 rowCount 裁决
 *  2) credit_ledger 的 (registration_id, event_type) 唯一索引兜底扣分
 *  3) payment_attempt 的幂等键兜底扣款
 *  4) forfeit_allocation 的 (no_show_reg_id, beneficiary_reg_id) 唯一索引兜底分账
 * 四层，任意一层单独失效都不会造成重复扣划。
 */
import { query, withTransaction, isUniqueViolation, queryOne } from '@/lib/db';
import { getClock } from '@/lib/clock';
import { auditIn } from '@/lib/services/audit.service';
import { CreditService } from '@/lib/services/credit.service';
import type { GuaranteePaymentService } from '@/lib/services/guarantee-payment.service';
import { getDefaultChannel } from '@/lib/services/pay-channel.registry';
import { splitForfeit, assertAllocationBalanced } from '@/lib/domain/forfeit-split';
import type { JobResult } from './types';

export interface FinalizeDeps {
  payment?: GuaranteePaymentService;
}

export async function runNoShowFinalizeJob(deps: FinalizeDeps = {}): Promise<JobResult> {
  const now = getClock().now();
  const jobName = 'noShowFinalizeJob';
  const credit = new CreditService();

  let payment = deps.payment;
  if (!payment) {
    const { GuaranteePaymentService } = await import('@/lib/services/guarantee-payment.service');
    payment = new GuaranteePaymentService(getDefaultChannel());
  }

  const candidates = await query<{
    id: string;
    user_id: string;
    activity_id: string;
    host_id: string;
    guarantee_amount: number;
  }>(
    `SELECT r.id, r.user_id, r.activity_id, r.host_id, r.guarantee_amount
       FROM registration r
       JOIN activity a ON a.id = r.activity_id
      WHERE r.checkin_status = 'NO_SHOW_CANDIDATE'
        AND r.registration_status IN ('CONFIRMED','NO_SHOW')
        AND a.start_at + interval '120 minutes' <= $1`,
    [now.toISOString()]
  );

  let affected = 0;

  for (const cand of candidates) {
    const lockKey = `no_show_finalize:${cand.id}`;
    try {
      const done = await withTransaction(async (c) => {
        try {
          await c.query(
            `INSERT INTO job_run(job_name, lock_key, status) VALUES($1,$2,'RUNNING')`,
            [jobName, lockKey]
          );
        } catch (e) {
          if (isUniqueViolation(e)) return false;
          throw e;
        }

        // 已有 NO_SHOW 信用流水的，说明已结算过，直接跳过（幂等）
        const settled = await c.query(
          `SELECT 1 FROM credit_ledger
            WHERE registration_id=$1 AND event_type='NO_SHOW'`,
          [cand.id]
        );
        if ((settled.rowCount ?? 0) > 0) {
          await c.query(
            `UPDATE job_run SET status='SKIPPED', finished_at=now()
              WHERE lock_key=$1 AND status='RUNNING'`,
            [lockKey]
          );
          return false;
        }

        // CAS：候选 -> 爽约
        const moved = await c.query(
          `UPDATE registration
              SET checkin_status='NO_SHOW',
                  registration_status='NO_SHOW',
                  updated_at=now()
            WHERE id=$1 AND checkin_status='NO_SHOW_CANDIDATE'
            RETURNING id`,
          [cand.id]
        );

        if (moved.rowCount === 0) {
          await c.query(
            `UPDATE job_run SET status='SKIPPED', finished_at=now()
              WHERE lock_key=$1 AND status='RUNNING'`,
            [lockKey]
          );
          return false;
        }

        await auditIn(c, {
          entityType: 'registration',
          entityId: cand.id,
          action: 'MARK_NO_SHOW',
          fromState: 'NO_SHOW_CANDIDATE',
          toState: 'NO_SHOW',
          operatorType: 'SYSTEM',
        });

        // 信用扣分：靠唯一约束保证只扣一次
        const res = await credit.applyIn(
          c,
          cand.id,
          cand.user_id,
          'NO_SHOW',
          -10,
          'T0+120min 未核销，自动判定爽约',
          'SYSTEM'
        );

        // 计算到场受益人
        const beneficiaries = await c.query<{
          id: string;
          checkin_at: string;
        }>(
          `SELECT id, checkin_at FROM registration
            WHERE activity_id=$1 AND checkin_status='CHECKED_IN'
              AND checkin_at IS NOT NULL`,
          [cand.activity_id]
        );

        // 分账明细落库（哪怕人数为 0 也不写，走退款分支）
        if (cand.guarantee_amount > 0 && beneficiaries.rows.length > 0) {
          const alloc = splitForfeit(
            cand.guarantee_amount,
            beneficiaries.rows.map((b) => ({
              registrationId: b.id,
              checkinAt: new Date(b.checkin_at),
            }))
          );
          assertAllocationBalanced(cand.guarantee_amount, alloc);

          const order = await c.query<{ id: string }>(
            'SELECT id FROM guarantee_order WHERE registration_id=$1',
            [cand.id]
          );
          const orderId = order.rows[0]?.id;

          for (const a of alloc) {
            await c.query(
              `INSERT INTO forfeit_allocation(
                 id, guarantee_order_id, activity_id,
                 beneficiary_reg_id, no_show_reg_id, amount
               ) VALUES ($1,$2,$3,$4,$5,$6)
               ON CONFLICT (no_show_reg_id, beneficiary_reg_id) DO NOTHING`,
              [
                `fa_${cand.id.slice(-12)}_${a.beneficiaryRegId.slice(-12)}`,
                orderId ?? null,
                cand.activity_id,
                a.beneficiaryRegId,
                cand.id,
                a.amount,
              ].map((v, i) => (i === 0 ? String(v) : v))
            );
          }
        }

        await c.query(
          `UPDATE job_run SET status='SUCCESS', affected=1, finished_at=now()
            WHERE lock_key=$1 AND status='RUNNING'`,
          [lockKey]
        );
        return res.alreadyProcessed === false;
      });

      if (!done) continue;

      // 资金动作放事务外：扣划 or 无人到场则退款
      const order = await queryOne<{ id: string; status: string; amount: number }>(
        'SELECT id, status, amount FROM guarantee_order WHERE registration_id=$1',
        [cand.id]
      );

      if (order && order.status === 'HELD') {
        const attendeeCount = await queryOne<{ c: string }>(
          `SELECT count(*)::text AS c FROM registration
            WHERE activity_id=$1 AND checkin_status='CHECKED_IN'`,
          [cand.activity_id]
        );
        if (Number(attendeeCount?.c ?? 0) === 0) {
          // 无人到场：保证金原路退，仅扣信用（规程 2.5）
          await payment.releaseOrder(order.id, 'NO_ONE_ATTENDED').catch((e) =>
            console.error('[noShowFinalize] 无到场退款失败', e)
          );
        } else {
          await payment
            .forfeitOrder(order.id, cand.activity_id, 'T0+120min 未核销，扣划补偿')
            .catch((e) => console.error('[noShowFinalize] 扣划失败', e));
        }
      }

      affected += 1;
    } catch (e) {
      console.error('[noShowFinalizeJob] 处理失败', cand.id, e);
    }
  }

  return { jobName, affected };
}
