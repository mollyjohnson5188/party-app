import { ok, handleError, requireUserId, parseJson } from '@/lib/api';
import { ActivityService } from '@/lib/services/activity.service';

/** POST /api/activities/{id}/cancel —— 主理人取消活动，批量退款 */
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

    const svc = new ActivityService();
    const res = await svc.cancel({
      activityId: id,
      operatorId: userId,
      operatorType: 'HOST',
      reason: body.reason ?? '主理人取消',
    });
    return ok(res);
  } catch (e) {
    return handleError(e);
  }
}
