import { ok, handleError, requireUserId } from '@/lib/api';
import { query } from '@/lib/db';

/** GET /api/me/registrations —— 我的报名列表 */
export async function GET(req: Request) {
  try {
    const userId = requireUserId(req);
    const rows = await query<Record<string, unknown>>(
      `SELECT r.id, r.activity_id, r.registration_status, r.checkin_status,
              r.guarantee_amount, r.checkin_at, r.created_at,
              a.title, a.location, a.start_at, a.end_at,
              g.status AS order_status, g.amount AS order_amount
         FROM registration r
         JOIN activity a ON a.id=r.activity_id
         LEFT JOIN guarantee_order g ON g.registration_id=r.id
        WHERE r.user_id=$1
        ORDER BY r.created_at DESC`,
      [userId]
    );

    return ok(
      rows.map((r) => ({
        id: r.id,
        activityId: r.activity_id,
        title: r.title,
        location: r.location,
        startAt: r.start_at,
        endAt: r.end_at,
        status: r.registration_status,
        checkinStatus: r.checkin_status,
        guaranteeAmount: r.guarantee_amount,
        orderStatus: r.order_status,
        checkinAt: r.checkin_at,
        createdAt: r.created_at,
      }))
    );
  } catch (e) {
    return handleError(e);
  }
}
