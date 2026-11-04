import { ok, handleError } from '@/lib/api';
import { query } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { resolveSession } from '@/lib/auth/session';

/** GET /api/admin/blog/posts/[id] —— 编辑前拉取完整内容 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await resolveSession(req.headers.get('cookie'));
    if (!auth || auth.user.role !== 'ADMIN') {
      throw new AppError('FORBIDDEN', 403, '需要管理员权限');
    }

    const { id } = await ctx.params;

    const rows = await query<Record<string, unknown>>(
      `SELECT id, slug, title, content, summary, cover_emoji, tags,
              seo_title, seo_description, keywords, is_featured,
              status, category_id
         FROM blog_post WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) throw new AppError('POST_NOT_FOUND', 404, '文章不存在');

    const r = rows[0];
    const linked = await query<{ activity_id: string }>(
      `SELECT activity_id FROM blog_post_activity WHERE post_id = $1`,
      [id]
    );

    return ok({
      id: r.id,
      slug: r.slug,
      title: r.title,
      content: r.content,
      summary: r.summary,
      coverEmoji: r.cover_emoji,
      tags: r.tags,
      seoTitle: r.seo_title,
      seoDescription: r.seo_description,
      keywords: r.keywords,
      isFeatured: r.is_featured,
      status: r.status,
      categoryId: r.category_id,
      activityIds: linked.map((l) => l.activity_id),
    });
  } catch (e) {
    return handleError(e);
  }
}
