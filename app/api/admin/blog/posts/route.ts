import { ok, handleError } from '@/lib/api';
import { query } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { resolveSession } from '@/lib/auth/session';

/** GET /api/admin/blog/posts —— 管理员查看全部文章（含草稿） */
export async function GET(req: Request) {
  try {
    const auth = await resolveSession(req.headers.get('cookie'));
    if (!auth || auth.user.role !== 'ADMIN') {
      throw new AppError('FORBIDDEN', 403, '需要管理员权限');
    }

    const rows = await query<Record<string, unknown>>(
      `SELECT p.id, p.slug, p.title, p.status, p.is_featured, p.read_count,
              p.published_at, p.cover_emoji, c.name AS category_name
         FROM blog_post p
         JOIN blog_category c ON c.id = p.category_id
        ORDER BY p.is_featured DESC, p.updated_at DESC
        LIMIT 200`
    );

    return ok({
      items: rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        status: r.status,
        isFeatured: r.is_featured,
        readCount: r.read_count,
        publishedAt: r.published_at,
        coverEmoji: r.cover_emoji,
        categoryName: r.category_name,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}
