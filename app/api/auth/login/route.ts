import { NextResponse } from 'next/server';
import { handleError, parseJson } from '@/lib/api';
import { query, queryOne } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, sessionCookieHeader } from '@/lib/auth/session';

interface Body {
  phone: string;
  password: string;
}

/** 简单的失败次数限制（内存级，单实例有效；多实例建议换 Redis） */
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;

function checkRate(key: string): void {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || rec.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  rec.count += 1;
  if (rec.count > MAX_ATTEMPTS) {
    throw new AppError('TOO_MANY_ATTEMPTS', 429, '尝试次数过多，请 10 分钟后再试');
  }
}

/** POST /api/auth/login */
export async function POST(req: Request) {
  try {
    const body = await parseJson<Body>(req);
    const phone = (body.phone ?? '').trim();
    const password = body.password ?? '';
    if (!phone || !password) {
      throw new AppError('VALIDATION_ERROR', 400, '请输入手机号和密码');
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
    checkRate(`${ip}:${phone}`);

    const u = await queryOne<{
      id: string;
      nickname: string;
      phone: string | null;
      password_hash: string | null;
      role: string;
      status: string;
      avatar_emoji: string;
    }>(
      `SELECT id, nickname, phone, password_hash, role, status, avatar_emoji
         FROM app_user WHERE phone = $1`,
      [phone]
    );

    // 统一错误文案，避免暴露"手机号是否存在"
    const bad = new AppError('BAD_CREDENTIALS', 401, '手机号或密码不正确');
    if (!u || !u.password_hash) throw bad;
    if (!(await verifyPassword(password, u.password_hash))) throw bad;
    if (u.status !== 'ACTIVE') {
      throw new AppError('ACCOUNT_DISABLED', 403, '账号已被停用，请联系管理员');
    }

    await query(`UPDATE app_user SET last_login_at = now() WHERE id = $1`, [u.id]);

    const score = await queryOne<{ score: number }>(
      `SELECT score FROM credit_account WHERE user_id = $1`,
      [u.id]
    );

    const sess = await createSession(u.id, {
      userAgent: req.headers.get('user-agent'),
      ip,
    });

    const res = NextResponse.json({
      success: true,
      data: {
        user: {
          id: u.id,
          nickname: u.nickname,
          phone: u.phone,
          role: u.role === 'ADMIN' ? 'ADMIN' : 'USER',
          avatarEmoji: u.avatar_emoji ?? '🧑‍🌾',
          creditScore: score?.score ?? 100,
        },
      },
    });
    res.headers.append('Set-Cookie', sessionCookieHeader(sess.token, sess.expiresAt));
    attempts.delete(`${ip}:${phone}`);
    return res;
  } catch (e) {
    return handleError(e);
  }
}
