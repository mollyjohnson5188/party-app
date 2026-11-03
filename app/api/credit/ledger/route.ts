import { ok, handleError, requireUserId } from '@/lib/api';
import { query } from '@/lib/db';

/** GET /api/credit/ledger?limit=20 —— 信用流水 */
export async function GET(req: Request) {
  try {
    const userId = requireUserId(req);
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);

    const rows = await query<{
      id: string;
      event_type: string;
      delta: number;
      nominal_delta: number;
      before_score: number;
      after_score: number;
      reason: string | null;
      registration_id: string | null;
      created_at: string;
    }>(
      `SELECT id, event_type, delta, nominal_delta, before_score, after_score,
              reason, registration_id, created_at
         FROM credit_ledger
        WHERE user_id=$1
        ORDER BY created_at DESC
        LIMIT $2`,
      [userId, limit]
    );

    return ok(
      rows.map((r) => ({
        id: r.id,
        eventType: r.event_type,
        delta: r.delta,
        nominalDelta: r.nominal_delta,
        beforeScore: r.before_score,
        afterScore: r.after_score,
        reason: r.reason,
        registrationId: r.registration_id,
        createdAt: r.created_at,
      }))
    );
  } catch (e) {
    return handleError(e);
  }
}
