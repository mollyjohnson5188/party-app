import { ok, handleError } from '@/lib/api';
import { query } from '@/lib/db';

/** GET /api/circle/boards —— 版块列表（含帖子数） */
export async function GET() {
  try {
    const rows = await query<Record<string, unknown>>(
      `SELECT b.id, b.name, b.slug, b.emoji, b.description,
              (SELECT count(*) FROM circle_post p
                WHERE p.board_id=b.id AND p.status='PUBLISHED'
                  AND p.review_status='PUBLISHED')::int AS post_count
         FROM circle_board b
        ORDER BY b.sort_no ASC`
    );
    return ok(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        emoji: r.emoji,
        description: r.description,
        postCount: r.post_count,
      }))
    );
  } catch (e) {
    return handleError(e);
  }
}
