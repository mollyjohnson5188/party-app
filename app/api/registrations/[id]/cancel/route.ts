import { ok, handleError, requireUserId, parseJson } from '@/lib/api';
import { RegistrationService } from '@/lib/services/registration.service';

/** POST /api/registrations/{id}/cancel —— 用户取消报名 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const userId = requireUserId(req);
    const { id } = await ctx.params;
    const body = await parseJson<{ reason?: string }>(req).catch(
      () => ({}) as { reason?: string }
    );

    const svc = new RegistrationService();
    const res = await svc.cancelByUser({ registrationId: id, userId, reason: body.reason });
    return ok(res);
  } catch (e) {
    return handleError(e);
  }
}
