import { NextResponse } from 'next/server';
import { handleError } from '@/lib/api';
import { clearCookieHeader, resolveSession, revokeSession } from '@/lib/auth/session';

/** POST /api/auth/logout —— 吊销当前 Session */
export async function POST(req: Request) {
  try {
    const auth = await resolveSession(req.headers.get('cookie'));
    if (auth) await revokeSession(auth.sessionId);
    const res = NextResponse.json({ success: true, data: { ok: true } });
    res.headers.append('Set-Cookie', clearCookieHeader());
    return res;
  } catch (e) {
    return handleError(e);
  }
}
