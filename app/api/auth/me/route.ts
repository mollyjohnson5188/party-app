import { ok, handleError } from '@/lib/api';
import { queryOne } from '@/lib/db';
import { resolveSession } from '@/lib/auth/session';

/** GET /api/auth/me —— 当前登录用户（未登录返回 null，不报错） */
export async function GET(req: Request) {
  try {
    const auth = await resolveSession(req.headers.get('cookie'));
    if (!auth) return ok(null);
    const score = await queryOne<{ score: number }>(
      `SELECT score FROM credit_account WHERE user_id = $1`,
      [auth.user.id]
    );
    return ok({
      user: {
        ...auth.user,
        creditScore: score?.score ?? 100,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
