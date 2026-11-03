/**
 * creditSettleJob：活动结束后统一结算"成行"加分。
 *
 * 规程 3.1 明确：成行加分在活动结束后由定时任务统一结算，
 * 避免"核销后立即加分解锁再报名"刷分。
 */
import { query, withTransaction, isUniqueViolation } from '@/lib/db';
import { getClock } from '@/lib/clock';
import { CreditService } from '@/lib/services/credit.service';
import type { JobResult } from './types';

export async function runCreditSettleJob(): Promise<JobResult> {
  const now = getClock().now();
  const jobName = 'creditSettleJob';
  const credit = new CreditService();

  // 活动已结束（end_at <= now），报名为已核销，且尚未记 CHECK_IN 流水
  const rows = await query<{ id: string; user_id: string; activity_id: string }>(
    `SELECT r.id, r.user_id, r.activity_id
       FROM registration r
       JOIN activity a ON a.id = r.activity_id
      WHERE r.checkin_status = 'CHECKED_IN'
        AND a.end_at <= $1
        AND a.status <> 'CANCELLED'
        AND NOT EXISTS (
          SELECT 1 FROM credit_ledger l
           WHERE l.registration_id = r.id AND l.event_type = 'CHECK_IN'
        )`,
    [now.toISOString()]
  );

  let affected = 0;
  for (const r of rows) {
    try {
      const done = await withTransaction(async (c) => {
        const lockKey = `credit_settle:${r.id}`;
        try {
          await c.query(
            `INSERT INTO job_run(job_name, lock_key, status) VALUES($1,$2,'RUNNING')`,
            [jobName, lockKey]
          );
        } catch (e) {
          if (isUniqueViolation(e)) return false;
          throw e;
        }
        const res = await credit.applyIn(
          c,
          r.id,
          r.user_id,
          'CHECK_IN',
          1,
          '活动结束，成行加分',
          'SYSTEM'
        );
        await c.query(
          `UPDATE job_run SET status=$2, affected=$3, finished_at=now()
            WHERE lock_key=$1 AND status='RUNNING'`,
          [lockKey, res.alreadyProcessed ? 'SKIPPED' : 'SUCCESS', res.alreadyProcessed ? 0 : 1]
        );
        return !res.alreadyProcessed;
      });
      if (done) affected += 1;
    } catch (e) {
      console.error('[creditSettleJob] 失败', r.id, e);
    }
  }

  return { jobName, affected };
}
