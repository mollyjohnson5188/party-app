import { ok, handleError, parseJson } from '@/lib/api';
import { query } from '@/lib/db';
import { getPool } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { resolveSession } from '@/lib/auth/session';
import { makeSlug, plainSummary } from '@/lib/blog/markdown';

/** GET /api/blog/posts?category=slug&tag=xxx&featured=1&limit=20&offset=0 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const category = url.searchParams.get('category');
    const tag = url.searchParams.get('tag');
    const featured = url.searchParams.get('featured') === '1';
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 20) || 20, 50);
    const offset = Math.max(Number(url.searchParams.get('offset') ?? 0) || 0, 0);

    const rows = await query<Record<string, unknown>>(
      `SELECT p.id, p.slug, p.title, p.summary, p.cover_emoji, p.tags,
              p.is_featured, p.read_count, p.published_at,
              c.name AS category_name, c.slug AS category_slug,
              u.nickname AS author_name
         FROM blog_post p
         JOIN blog_category c ON c.id = p.category_id
         JOIN app_user u ON u.id = p.author_id
        WHERE p.status = 'PUBLISHED'
          AND p.published_at IS NOT NULL
          AND p.published_at <= now()
          AND ($1::text IS NULL OR c.slug = $1)
          AND ($2::text IS NULL OR $2 = ANY(p.tags))
          AND ($3::boolean IS NOT TRUE OR p.is_featured = true)
        ORDER BY p.is_featured DESC, p.published_at DESC
        LIMIT $4 OFFSET $5`,
      [category, tag, featured, limit, offset]
    );

    const total = await query<{ c: string }>(
      `SELECT count(*)::text AS c FROM blog_post p
         JOIN blog_category c ON c.id=p.category_id
        WHERE p.status='PUBLISHED' AND p.published_at IS NOT NULL AND p.published_at <= now()
          AND ($1::text IS NULL OR c.slug = $1)`,
      [category]
    );

    return ok({
      total: Number(total[0]?.c ?? 0),
      items: rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        summary: r.summary,
        coverEmoji: r.cover_emoji,
        tags: r.tags,
        isFeatured: r.is_featured,
        readCount: r.read_count,
        publishedAt: r.published_at,
        category: { name: r.category_name, slug: r.category_slug },
        author: { name: r.author_name },
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}

/**
 * POST /api/blog/posts —— 管理员发布/编辑文章
 * 直接发布（status=PUBLISHED）；带 draft=true 则存草稿。
 */
export async function POST(req: Request) {
  try {
    const auth = await resolveSession(req.headers.get('cookie'));
    if (!auth || auth.user.role !== 'ADMIN') {
      throw new AppError('FORBIDDEN', 403, '需要管理员权限');
    }

    const body = await parseJson<{
      id?: string;
      title: string;
      content: string;
      categoryId: string;
      summary?: string;
      coverEmoji?: string;
      tags?: string[];
      seoTitle?: string;
      seoDescription?: string;
      keywords?: string;
      featured?: boolean;
      draft?: boolean;
      activityIds?: string[];
    }>(req);

    if (!body.title?.trim()) throw new AppError('VALIDATION_ERROR', 400, '请填写标题');
    if (!body.content?.trim()) throw new AppError('VALIDATION_ERROR', 400, '请填写正文');
    if (!body.categoryId) throw new AppError('VALIDATION_ERROR', 400, '请选择分类');

    const status = body.draft ? 'DRAFT' : 'PUBLISHED';
    const summary = (body.summary?.trim() || plainSummary(body.content, 160)).slice(0, 300);

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');

      let postId = body.id ?? null;
      let slug: string;

      if (postId) {
        // 编辑
        const cur = await client.query<{ slug: string }>(
          `SELECT slug FROM blog_post WHERE id=$1`,
          [postId]
        );
        if (cur.rowCount === 0) throw new AppError('POST_NOT_FOUND', 404, '文章不存在');
        slug = cur.rows[0].slug;
        await client.query(
          `UPDATE blog_post
              SET title=$1, summary=$2, content=$3, category_id=$4, cover_emoji=$5,
                  tags=$6, seo_title=$7, seo_description=$8, keywords=$9,
                  is_featured=$10, status=$11,
                  published_at = CASE WHEN $11='PUBLISHED' AND published_at IS NULL
                                      THEN now() ELSE published_at END,
                  updated_at=now()
            WHERE id=$12`,
          [
            body.title.trim(),
            summary,
            body.content.trim(),
            body.categoryId,
            body.coverEmoji ?? '🏔️',
            body.tags ?? [],
            body.seoTitle ?? body.title.trim(),
            body.seoDescription ?? summary,
            body.keywords ?? (body.tags ?? []).join(','),
            body.featured ?? false,
            status,
            postId,
          ]
        );
      } else {
        // 新建
        slug = makeSlug(body.title.trim());
        postId = `bp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        await client.query(
          `INSERT INTO blog_post(id, slug, category_id, author_id, title, summary, content,
                                 cover_emoji, tags, seo_title, seo_description, keywords,
                                 is_featured, status, published_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
                   CASE WHEN $14='PUBLISHED' THEN now() ELSE NULL END)`,
          [
            postId,
            slug,
            body.categoryId,
            auth.user.id,
            body.title.trim(),
            summary,
            body.content.trim(),
            body.coverEmoji ?? '🏔️',
            body.tags ?? [],
            body.seoTitle ?? body.title.trim(),
            body.seoDescription ?? summary,
            body.keywords ?? (body.tags ?? []).join(','),
            body.featured ?? false,
            status,
          ]
        );
      }

      // 关联活动
      if (body.activityIds) {
        await client.query(`DELETE FROM blog_post_activity WHERE post_id=$1`, [postId]);
        for (const aid of body.activityIds.slice(0, 6)) {
          await client.query(
            `INSERT INTO blog_post_activity(post_id, activity_id)
             VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [postId, aid]
          );
        }
      }

      await client.query('COMMIT');
      return ok({ id: postId, slug, status });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    return handleError(e);
  }
}
