import { ok, handleError, requireUserId, parseJson } from '@/lib/api';
import { query, queryOne } from '@/lib/db';
import { AppError } from '@/lib/errors';

/** GET /api/circle/posts?board=xxx&sort=latest|hot&q=关键词 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const board = url.searchParams.get('board');
    const sort = url.searchParams.get('sort') ?? 'latest';
    const q = url.searchParams.get('q');
    const mine = url.searchParams.get('mine') === '1';
    const viewerId = req.headers.get('x-user-id');

    const rows = await query<Record<string, unknown>>(
      `SELECT p.id, p.title, substr(p.content,1,160) AS excerpt,
              p.like_count, p.reply_count, p.is_pinned, p.created_at,
              p.activity_id, a.title AS activity_title,
              b.id AS board_id, b.name AS board_name, b.emoji AS board_emoji, b.slug AS board_slug,
              u.id AS author_id, u.nickname AS author_name,
              EXISTS(SELECT 1 FROM circle_like l
                      WHERE l.post_id=p.id AND l.user_id=$1) AS liked
         FROM circle_post p
         JOIN circle_board b ON b.id=p.board_id
         JOIN app_user u ON u.id=p.author_id
         LEFT JOIN activity a ON a.id=p.activity_id
        WHERE p.status='PUBLISHED'
          AND ($2::text IS NULL OR p.board_id=$2)
          AND ($3::text IS NULL OR p.title ILIKE '%'||$3||'%' OR p.content ILIKE '%'||$3||'%')
          AND ($5::boolean IS NOT TRUE OR p.author_id=$1)
        ORDER BY
          CASE WHEN $4='hot' THEN NULL ELSE p.is_pinned END DESC NULLS LAST,
          CASE WHEN $4='hot'
               THEN (p.like_count*3 + p.reply_count*2) END DESC NULLS LAST,
          p.created_at DESC
        LIMIT 100`,
      [viewerId, board || null, q || null, sort, mine]
    );

    return ok(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        excerpt: r.excerpt,
        likeCount: r.like_count,
        replyCount: r.reply_count,
        isPinned: r.is_pinned,
        createdAt: r.created_at,
        activityId: r.activity_id,
        activityTitle: r.activity_title,
        board: { id: r.board_id, name: r.board_name, emoji: r.board_emoji, slug: r.board_slug },
        author: { id: r.author_id, name: r.author_name },
        liked: r.liked,
      }))
    );
  } catch (e) {
    return handleError(e);
  }
}

/** POST /api/circle/posts —— 发帖 */
export async function POST(req: Request) {
  try {
    const userId = requireUserId(req);
    const body = await parseJson<{
      boardId: string;
      title: string;
      content: string;
      activityId?: string;
    }>(req);

    if (!body.title?.trim()) throw new AppError('VALIDATION_ERROR', 400, '请填写标题');
    if (!body.content?.trim()) throw new AppError('VALIDATION_ERROR', 400, '请填写正文');
    if (body.title.length > 120) throw new AppError('VALIDATION_ERROR', 400, '标题请控制在 120 字内');

    const board = await queryOne<{ id: string }>(
      `SELECT id FROM circle_board WHERE id=$1`,
      [body.boardId]
    );
    if (!board) throw new AppError('BOARD_NOT_FOUND', 404, '版块不存在');

    // 兜底：演示身份可能未落库
    await query(
      `INSERT INTO app_user(id,nickname,phone) VALUES($1,$2,$3) ON CONFLICT (id) DO NOTHING`,
      [userId, `用户${userId.slice(-4)}`, `9${Date.now().toString().slice(-10)}`]
    );

    const id = `post_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    await query(
      `INSERT INTO circle_post(id, board_id, author_id, title, content, activity_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, body.boardId, userId, body.title.trim(), body.content.trim(), body.activityId || null]
    );

    return ok({ id });
  } catch (e) {
    return handleError(e);
  }
}
