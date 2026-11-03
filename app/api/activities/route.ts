import { ok, handleError, requireUserId, parseJson } from '@/lib/api';
import { AppError } from '@/lib/errors';
import { query } from '@/lib/db';

/** GET /api/activities —— 活动列表（含当前用户报名状态） */
export async function GET(req: Request) {
  try {
    const userId = req.headers.get('x-user-id');
    const rows = await query<Record<string, unknown>>(
      `SELECT a.id, a.title, a.location, a.start_at, a.end_at, a.capacity,
              a.status, a.guarantee_mode, a.guarantee_amount, a.min_credit_score,
              u.nickname AS host_name,
              (SELECT count(*) FROM registration r
                WHERE r.activity_id=a.id
                  AND r.registration_status IN ('PENDING_PAYMENT','CONFIRMED','CHECKED_IN','NO_SHOW')
              )::int AS joined,
              (SELECT CASE r.registration_status::text
                        WHEN 'CHECKED_IN' THEN 'CHECKED_IN'
                        ELSE r.registration_status::text END
                 FROM registration r
                WHERE r.activity_id=a.id AND r.user_id=$1
                  AND r.registration_status IN ('PENDING_PAYMENT','CONFIRMED','CHECKED_IN','NO_SHOW')
                LIMIT 1) AS my_status
         FROM activity a
         JOIN app_user u ON u.id = a.host_id
        WHERE a.status IN ('PUBLISHED','ONGOING','FINISHED')
        ORDER BY a.start_at ASC`,
      [userId]
    );

    return ok(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        location: r.location,
        startAt: r.start_at,
        endAt: r.end_at,
        capacity: r.capacity,
        joined: r.joined,
        status: r.status,
        guaranteeMode: r.guarantee_mode,
        guaranteeAmount: r.guarantee_amount,
        minCreditScore: r.min_credit_score,
        hostName: r.host_name,
        myStatus: r.my_status,
      }))
    );
  } catch (e) {
    return handleError(e);
  }
}

/** POST /api/activities —— 主理人发布活动（MVP 简化） */
export async function POST(req: Request) {
  try {
    const hostId = requireUserId(req);
    const body = await parseJson<{
      title: string;
      location?: string;
      startAt: string;
      durationMin?: number;
      capacity: number;
      guaranteeMode?: 'NONE' | 'GUARANTEE';
      guaranteeAmount?: number;
      minCreditScore?: number;
      description?: string;
    }>(req);

    if (!body.title || !body.startAt || !body.capacity) {
      throw new AppError('VALIDATION_ERROR', 400, 'title / startAt / capacity 必填');
    }
    const mode = body.guaranteeMode ?? 'NONE';
    const amount = mode === 'GUARANTEE' ? Number(body.guaranteeAmount ?? 0) : 0;
    if (mode === 'GUARANTEE' && amount <= 0) {
      throw new AppError('VALIDATION_ERROR', 400, 'GUARANTEE 模式必须设置保证金金额');
    }

    const start = new Date(body.startAt);
    const end = new Date(start.getTime() + (body.durationMin ?? 180) * 60_000);
    const id = `act_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

    await query(
      `INSERT INTO activity(
         id, host_id, title, description, location, start_at, end_at,
         capacity, status, guarantee_mode, guarantee_amount, min_credit_score
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PUBLISHED',$9,$10,$11)`,
      [
        id,
        hostId,
        body.title,
        body.description ?? null,
        body.location ?? null,
        start.toISOString(),
        end.toISOString(),
        body.capacity,
        mode,
        amount,
        body.minCreditScore ?? 0,
      ]
    );

    return ok({ id });
  } catch (e) {
    return handleError(e);
  }
}
