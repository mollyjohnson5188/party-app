import { ok, handleError, requireAdmin, parseJson } from '@/lib/api';
import { query } from '@/lib/db';
import { AppError } from '@/lib/errors';

/** GET /api/admin/circle/review —— 待审核帖子列表 */
export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const rows = await query<Record<string, unknown>>(
      `SELECT p.id, p.title, substr(p.content,1,200) AS excerpt, p.created_at,
              b.name AS board_name, b.emoji AS board_emoji,
              u.id AS author_id, u.nickname AS author_name
         FROM circle_post p
         JOIN circle_board b ON b.id=p.board_id
         JOIN app_user u ON u.id=p.author_id
        WHERE p.review_status='PENDING'
        ORDER BY p.created_at ASC
        LIMIT 100`
    );
    return ok(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        excerpt: r.excerpt,
        createdAt: r.created_at,
        board: { name: r.board_name, emoji: r.board_emoji },
        author: { id: r.author_id, name: r.author_name },
      }))
    );
  } catch (e) {
    return handleError(e);
  }
}

/** POST /api/admin/circle/review —— 审核（body: { postId, approved, reason? }) */
export async function POST(req: Request) {
  try {
    const auth = await requireAdmin(req);
    const body = await parseJson<{ postId: string; approved: boolean; reason?: string }>(req);
    if (!body.postId) throw new AppError('VALIDATION_ERROR', 400, 'postId 必填');

    const rows = await query<{ id: string }>(
      `UPDATE circle_post
          SET review_status = $1,
              reviewed_by = $2,
              reviewed_at = now(),
              reject_reason = $3,
              status = $4
        WHERE id = $5 AND review_status = 'PENDING'
        RETURNING id`,
      [
        body.approved ? 'PUBLISHED' : 'REJECTED',
        auth.user.id,
        body.approved ? null : (body.reason ?? '内容不符合社区规范'),
        body.approved ? 'PUBLISHED' : 'HIDDEN',
        body.postId,
      ]
    );
    if (rows.length === 0) {
      throw new AppError('NOT_PENDING', 409, '该帖子已审核过或不存在');
    }
    return ok({ postId: body.postId, approved: body.approved });
  } catch (e) {
    return handleError(e);
  }
}
