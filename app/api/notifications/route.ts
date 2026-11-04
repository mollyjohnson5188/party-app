import { ok, handleError, resolveUserId } from '@/lib/api';
import { query } from '@/lib/db';

/** GET /api/notifications —— 我的站内信 */
export async function GET(req: Request) {
  try {
    const userId = await resolveUserId(req);
    const rows = await query<{
      id: string;
      type: string;
      payload: unknown;
      read_at: string | null;
      created_at: string;
    }>(
      `SELECT id, type, payload, read_at, created_at
         FROM notification WHERE user_id=$1
        ORDER BY created_at DESC LIMIT 50`,
      [userId]
    );
    return ok(
      rows.map((r) => ({
        id: r.id,
        type: r.type,
        payload: r.payload,
        readAt: r.read_at,
        createdAt: r.created_at,
      }))
    );
  } catch (e) {
    return handleError(e);
  }
}
