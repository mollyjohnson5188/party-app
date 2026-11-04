import { ok, handleError, requireAdmin, parseJson } from '@/lib/api';
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
    // 管理员身份以数据库中的 role 为准，不再接受任何客户端自报角色
    const auth = await requireAdmin(req);
    const adminId = auth.user.id;

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
