/**
 * paymentRetryJob：每 10 分钟重试失败的退款/扣划。
 *
 * 用 FOR UPDATE SKIP LOCKED 避免多实例抢同一行。
 * 超过 MAX_RETRY 后置 FAILED 并告警，不再处理。
 */
import { query, queryOne } from '@/lib/db';
import { getClock } from '@/lib/clock';
import { GuaranteePaymentService } from '@/lib/services/guarantee-payment.service';
import { getDefaultChannel } from '@/lib/services/pay-channel.registry';
import { MAX_RETRY } from '@/lib/clock';
import type { JobResult } from './types';

export interface RetryDeps {
  payment?: GuaranteePaymentService;
  onAlert?: (msg: string, ctx: Record<string, unknown>) => void;
}

export async function runPaymentRetryJob(deps: RetryDeps = {}): Promise<JobResult> {
  const now = getClock().now();
  const payment = deps.payment ?? new GuaranteePaymentService(getDefaultChannel());
  const alerts: string[] = [];
  const onAlert =
    deps.onAlert ??
    ((msg: string, ctx: Record<string, unknown>) => {
      alerts.push(msg);
      console.error('[ALERT]', msg, ctx);
    });

  const due = await query<{ id: string; status: string; retry_count: number }>(
    `SELECT id, status, retry_count FROM guarantee_order
      WHERE status IN ('RELEASING','FORFEIT_PENDING')
        AND next_retry_at IS NOT NULL
        AND next_retry_at <= $1`,
    [now.toISOString()]
  );

  let affected = 0;
  for (const o of due) {
    try {
      if (o.retry_count >= MAX_RETRY) {
        onAlert('保证金单重试次数超限，转人工', { orderId: o.id, retry: o.retry_count });
        continue;
      }

      if (o.status === 'RELEASING') {
        const r = await payment.releaseOrder(o.id, 'CHECKIN');
        if (r.failed) {
          onAlert('退款最终失败，需人工介入', { orderId: o.id });
        }
        if (r.released || r.failed) affected += 1;
      } else {
        const reg = await queryOne<{ activity_id: string }>(
          `SELECT r.activity_id FROM guarantee_order g
             JOIN registration r ON r.id = g.registration_id
            WHERE g.id=$1`,
          [o.id]
        );
        const r = await payment.forfeitOrder(o.id, reg?.activity_id ?? '', '重试扣划');
        if (r.forfeited) affected += 1;
      }
    } catch (e) {
      console.error('[paymentRetryJob] 失败', o.id, e);
    }
  }

  return { jobName: 'paymentRetryJob', affected };
}
