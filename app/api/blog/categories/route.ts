import { ok, handleError } from '@/lib/api';
import { query } from '@/lib/db';

/** GET /api/blog/categories */
export async function GET() {
  try {
    const rows = await query<Record<string, unknown>>(
      `SELECT c.id, c.name, c.slug, c.description,
              (SELECT count(*) FROM blog_post p
                WHERE p.category_id=c.id AND p.status='PUBLISHED')::int AS post_count
         FROM blog_category c ORDER BY c.sort_no ASC`
    );
    return ok(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        description: r.description,
        postCount: r.post_count,
      }))
    );
  } catch (e) {
    return handleError(e);
  }
}
