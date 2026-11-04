import { ok, handleError } from '@/lib/api';
import { query, queryOne } from '@/lib/db';
import { Err } from '@/lib/errors';

/**
 * GET /api/activities/{id} —— 活动详情
 * 主理人视角额外返回报名名单（含核销码，用于现场手动核销）。
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const viewerId = req.headers.get('x-user-id');

    const act = await queryOne<Record<string, unknown>>(
      `SELECT a.*, u.nickname AS host_name
         FROM activity a JOIN app_user u ON u.id=a.host_id
        WHERE a.id=$1`,
      [id]
    );
    if (!act) throw Err.activityNotFound(id);

    const isHost = viewerId === act.host_id;

    const regs = await query<Record<string, unknown>>(
      `SELECT r.id, r.user_id, u.nickname, r.registration_status, r.checkin_status,
              r.guarantee_amount, r.checkin_at, r.created_at,
              ca.score AS credit_score,
              r.checkin_code_cipher,
              g.status AS order_status
         FROM registration r
         JOIN app_user u ON u.id=r.user_id
         LEFT JOIN credit_account ca ON ca.user_id=r.user_id
         LEFT JOIN guarantee_order g ON g.registration_id=r.id
        WHERE r.activity_id=$1
          AND r.registration_status IN ('PENDING_PAYMENT','CONFIRMED','CHECKED_IN','NO_SHOW')
        ORDER BY r.created_at ASC`,
      [id]
    );

    const { decryptShortCode } = await import('@/lib/checkin-code');

    return ok({
      id: act.id,
      title: act.title,
      description: act.description,
      location: act.location,
      startAt: act.start_at,
      endAt: act.end_at,
      capacity: act.capacity,
      status: act.status,
      guaranteeMode: act.guarantee_mode,
      guaranteeAmount: act.guarantee_amount,
      minCreditScore: act.min_credit_score,
      theme: act.theme,
      category: act.category,
      hostId: act.host_id,
      hostName: act.host_name,
      isHost,
      registrations: isHost
        ? regs.map((r) => ({
            id: r.id,
            userId: r.user_id,
            nickname: r.nickname,
            status: r.registration_status,
            checkinStatus: r.checkin_status,
            guaranteeAmount: r.guarantee_amount,
            checkinAt: r.checkin_at,
            creditScore: r.credit_score,
            orderStatus: r.order_status,
            checkinCode: r.checkin_code_cipher
              ? decryptShortCode(String(r.checkin_code_cipher))
              : null,
          }))
        : undefined,
      registrationCount: regs.length,
    });
  } catch (e) {
    return handleError(e);
  }
}
