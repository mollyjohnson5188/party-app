import { ok, handleError, parseJson, resolveUserId } from '@/lib/api';
import { query } from '@/lib/db';
import { AppError } from '@/lib/errors';

/** GET /api/circle/follow —— 我关注的版块 id 列表 */
export async function GET(req: Request) {
  try {
    const userId = await resolveUserId(req).catch(() => null);
    if (!userId) return ok({ boards: [] as string[] });
    const rows = await query<{ board_id: string }>(
      `SELECT board_id FROM circle_follow WHERE user_id=$1`,
      [userId]
    );
    return ok({ boards: rows.map((r) => r.board_id) });
  } catch (e) {
    return handleError(e);
  }
}

/** POST /api/circle/follow —— 关注 / 取关（body: { boardId, follow }） */
export async function POST(req: Request) {
  try {
    const userId = await resolveUserId(req);
    const body = await parseJson<{ boardId: string; follow: boolean }>(req);
    if (!body.boardId) throw new AppError('VALIDATION_ERROR', 400, 'boardId 必填');

    if (body.follow) {
      await query(
        `INSERT INTO circle_follow(user_id, board_id) VALUES($1,$2)
         ON CONFLICT (user_id, board_id) DO NOTHING`,
        [userId, body.boardId]
      );
    } else {
      await query(`DELETE FROM circle_follow WHERE user_id=$1 AND board_id=$2`, [
        userId,
        body.boardId,
      ]);
    }
    return ok({ boardId: body.boardId, following: body.follow });
  } catch (e) {
    return handleError(e);
  }
}
