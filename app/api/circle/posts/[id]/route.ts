import { ok, handleError, requireUserId, parseJson } from '@/lib/api';
import { getPool } from '@/lib/db';
import { AppError } from '@/lib/errors';

/** GET /api/circle/posts/[id] —— 帖子详情 + 回复列表 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const viewerId = req.headers.get('x-user-id');
    const c = await getPool().connect();
    try {
      const p = await c.query(
        `SELECT p.*, b.name AS board_name, b.emoji AS board_emoji, b.slug AS board_slug,
                u.nickname AS author_name, a.title AS activity_title
           FROM circle_post p
           JOIN circle_board b ON b.id=p.board_id
           JOIN app_user u ON u.id=p.author_id
           LEFT JOIN activity a ON a.id=p.activity_id
          WHERE p.id=$1`,
        [id]
      );
      if (p.rowCount === 0) throw new AppError('POST_NOT_FOUND', 404, '帖子不存在');
      const post = p.rows[0];

      const replies = await c.query(
        `SELECT r.id, r.content, r.created_at, r.parent_id,
                u.id AS author_id, u.nickname AS author_name
           FROM circle_reply r JOIN app_user u ON u.id=r.author_id
          WHERE r.post_id=$1 ORDER BY r.created_at ASC`,
        [id]
      );

      const liked = await c.query(
        `SELECT 1 FROM circle_like WHERE post_id=$1 AND user_id=$2`,
        [id, viewerId]
      );

      return ok({
        id: post.id,
        title: post.title,
        content: post.content,
        likeCount: post.like_count,
        replyCount: post.reply_count,
        createdAt: post.created_at,
        activityId: post.activity_id,
        activityTitle: post.activity_title,
        board: { id: post.board_id, name: post.board_name, emoji: post.board_emoji, slug: post.board_slug },
        author: { id: post.author_id, name: post.author_name },
        liked: (liked.rowCount ?? 0) > 0,
        replies: replies.rows.map((r) => ({
          id: r.id,
          content: r.content,
          createdAt: r.created_at,
          parentId: r.parent_id,
          author: { id: r.author_id, name: r.author_name },
        })),
      });
    } finally {
      c.release();
    }
  } catch (e) {
    return handleError(e);
  }
}

/** POST /api/circle/posts/[id] —— 回复 / 点赞（body.action = reply | like） */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const userId = requireUserId(req);
    const { id } = await ctx.params;
    const body = await parseJson<{ action: 'reply' | 'like'; content?: string }>(req);

    if (body.action === 'like') {
      const c = await getPool().connect();
      try {
        await c.query('BEGIN');
        const ins = await c.query(
          `INSERT INTO circle_like(post_id,user_id) VALUES($1,$2)
           ON CONFLICT (post_id,user_id) DO NOTHING RETURNING post_id`,
          [id, userId]
        );
        if (ins.rowCount && ins.rowCount > 0) {
          await c.query(`UPDATE circle_post SET like_count=like_count+1 WHERE id=$1`, [id]);
        }
        await c.query('COMMIT');
        const r = await c.query(`SELECT like_count FROM circle_post WHERE id=$1`, [id]);
        return ok({ liked: (ins.rowCount ?? 0) > 0, likeCount: r.rows[0]?.like_count ?? 0 });
      } catch (e) {
        await c.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    }

    if (!body.content?.trim()) throw new AppError('VALIDATION_ERROR', 400, '请填写回复内容');

    await getPool().query(
      `INSERT INTO app_user(id,nickname,phone) VALUES($1,$2,$3) ON CONFLICT (id) DO NOTHING`,
      [userId, `用户${userId.slice(-4)}`, `9${Date.now().toString().slice(-10)}`]
    );

    const c = await getPool().connect();
    try {
      await c.query('BEGIN');
      const rid = `rep_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      await c.query(
        `INSERT INTO circle_reply(id,post_id,author_id,content) VALUES($1,$2,$3,$4)`,
        [rid, id, userId, body.content.trim()]
      );
      await c.query(`UPDATE circle_post SET reply_count=reply_count+1, updated_at=now() WHERE id=$1`, [id]);
      await c.query('COMMIT');
      return ok({ id: rid });
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  } catch (e) {
    return handleError(e);
  }
}
