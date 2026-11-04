import { ok, handleError } from '@/lib/api';
import { AppError } from '@/lib/errors';
import { GuaranteePaymentService } from '@/lib/services/guarantee-payment.service';
import { getDefaultChannel } from '@/lib/services/pay-channel.registry';
import { runNoShowCandidateJob } from '@/lib/jobs/no-show-candidate.job';
import { runNoShowFinalizeJob } from '@/lib/jobs/no-show-finalize.job';
import { runCreditSettleJob } from '@/lib/jobs/credit-settle.job';
import { runPaymentRetryJob } from '@/lib/jobs/payment-retry.job';

const JOBS = [
  'noShowCandidateJob',
  'noShowFinalizeJob',
  'creditSettleJob',
  'paymentRetryJob',
] as const;

/**
 * POST /api/cron/{job} —— 触发定时任务。
 * 生产环境由调度器（Cron / 平台定时触发器）调用，需带 CRON_SECRET。
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ job: string }> }
) {
  try {
    // 安全铁律：定时任务会真实扣款、扣分、判定爽约，绝不能匿名触发。
    //  - 未配置 CRON_SECRET 时，一律拒绝（fail-closed）
    //  - 配置了则必须精确匹配
    //  - 额外支持管理员 Session 手动触发（用于运营排障）
    const secret = process.env.CRON_SECRET;
    const provided = req.headers.get('x-cron-secret');
    if (!secret) {
      const { resolveSession } = await import('@/lib/auth/session');
      const auth = await resolveSession(req.headers.get('cookie'));
      if (!auth || auth.user.role !== 'ADMIN') {
        throw new AppError('FORBIDDEN', 403, '定时任务未配置密钥，禁止匿名触发');
      }
    } else if (provided !== secret) {
      const { resolveSession } = await import('@/lib/auth/session');
      const auth = await resolveSession(req.headers.get('cookie'));
      if (!auth || auth.user.role !== 'ADMIN') {
        throw new AppError('FORBIDDEN', 403, '定时任务鉴权失败');
      }
    }

    const { job } = await ctx.params;
    if (!JOBS.includes(job as (typeof JOBS)[number])) {
      throw new AppError('VALIDATION_ERROR', 400, `未知任务：${job}`);
    }

    const payment = new GuaranteePaymentService(getDefaultChannel());

    let result;
    switch (job) {
      case 'noShowCandidateJob':
        result = await runNoShowCandidateJob();
        break;
      case 'noShowFinalizeJob':
        result = await runNoShowFinalizeJob({ payment });
        break;
      case 'creditSettleJob':
        result = await runCreditSettleJob();
        break;
      case 'paymentRetryJob':
        result = await runPaymentRetryJob({ payment });
        break;
    }
    return ok(result);
  } catch (e) {
    return handleError(e);
  }
}
