import { ok, handleError, requireUserId, parseJson } from '@/lib/api';
import { AppError } from '@/lib/errors';
import { AppealService } from '@/lib/services/appeal.service';
import { GuaranteePaymentService } from '@/lib/services/guarantee-payment.service';
import { getDefaultChannel } from '@/lib/services/pay-channel.registry';

/**
 * POST /api/admin/appeals/{id}/review —— 管理员审核申诉
 * 通过则回滚信用与保证金（只能回滚一次，由 DB 唯一约束保证）
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const adminId = requireUserId(req);
    // 简易管理员校验：MVP 用 X-Role 头；生产接 RBAC
    if (req.headers.get('x-role') !== 'admin') {
      throw new AppError('FORBIDDEN', 403, '需要管理员权限');
    }

    const { id } = await ctx.params;
    const body = await parseJson<{ approved: boolean; note?: string }>(req);

    const payment = new GuaranteePaymentService(getDefaultChannel());
    const svc = new AppealService(payment);
    const res = await svc.review({
      appealId: id,
      adminId,
      approved: Boolean(body.approved),
      note: body.note,
    });
    return ok(res);
  } catch (e) {
    return handleError(e);
  }
}
