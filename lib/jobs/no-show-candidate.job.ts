/**
 * noShowCandidateJob：每 5 分钟扫描 T0+60min 已到且未核销的 CONFIRMED 报名，
 * 置 NO_SHOW_CANDIDATE 并通知。
 *
 * 幂等三重保险：
 *  1) UPDATE ... WHERE checkin_status='UNUSED' 的 rowCount 裁决
 *  2) job_run 的 RUNNING 唯一索引拦重复实例
 *  3) 通知与审计只在 CAS 成功分支写
 */
import { query, withTransaction, isUniqueViolation } from '@/lib/db';
import { getClock } from '@/lib/clock';
import { auditIn } from '@/lib/services/audit.service';
import type { JobResult } from './types';

export async function runNoShowCandidateJob(): Promise<JobResult> {
  const now = getClock().now();
  const jobName = 'noShowCandidateJob';

  const candidates = await query<{
    id: string;
    user_id: string;
    activity_id: string;
    host_id: string;
  }>(
    `SELECT r.id, r.user_id, r.activity_id, r.host_id
       FROM registration r
       JOIN activity a ON a.id = r.activity_id
      WHERE r.registration_status = 'CONFIRMED'
        AND r.checkin_status = 'UNUSED'
        AND a.status IN ('PUBLISHED','ONGOING')
        AND a.start_at + interval '60 minutes' <= $1
        AND a.start_at + interval '120 minutes' > $1`,
    [now.toISOString()]
  );

  let affected = 0;

  for (const cand of candidates) {
    const lockKey = `no_show_candidate:${cand.id}`;
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

        const moved = await c.query(
          `UPDATE registration
              SET checkin_status='NO_SHOW_CANDIDATE',
                  no_show_candidate_at=$1, updated_at=now()
            WHERE id=$2 AND checkin_status='UNUSED'`,
          [now.toISOString(), cand.id]
        );

        if (moved.rowCount === 0) {
          await c.query(
            `UPDATE job_run SET status='SKIPPED', finished_at=now()
              WHERE lock_key=$1 AND status='RUNNING'`,
            [lockKey]
          );
          return false;
        }

        await c.query(
          `INSERT INTO notification(user_id, type, payload)
           VALUES ($1,'NO_SHOW_CANDIDATE',$3), ($2,'NO_SHOW_CANDIDATE_HOST',$3)`,
          [
            cand.user_id,
            cand.host_id,
            JSON.stringify({ registrationId: cand.id, activityId: cand.activity_id }),
          ]
        );

        await auditIn(c, {
          entityType: 'registration',
          entityId: cand.id,
          action: 'NO_SHOW_CANDIDATE',
          fromState: 'UNUSED',
          toState: 'NO_SHOW_CANDIDATE',
          operatorType: 'SYSTEM',
        });

        await c.query(
          `UPDATE job_run SET status='SUCCESS', affected=1, finished_at=now()
            WHERE lock_key=$1 AND status='RUNNING'`,
          [lockKey]
        );
        return true;
      });

      if (done) affected += 1;
    } catch (e) {
      console.error('[noShowCandidateJob] 处理失败', cand.id, e);
    }
  }

  return { jobName, affected };
}
