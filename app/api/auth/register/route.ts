import { NextResponse } from 'next/server';
import { ok, handleError, parseJson } from '@/lib/api';
import { query, queryOne } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { newId } from '@/lib/id';
import { hashPassword, isNickname, isPhone, isStrongPassword } from '@/lib/auth/password';
import { createSession, sessionCookieHeader } from '@/lib/auth/session';

interface Body {
  phone: string;
  password: string;
  nickname: string;
  /** 注册邀请码：设为管理员用；不填即为普通用户 */
  adminCode?: string;
}

/**
 * POST /api/auth/register —— 手机号 + 密码注册
 * 成功后直接建立 Session（免二次登录）
 */
export async function POST(req: Request) {
  try {
    const body = await parseJson<Body>(req);
    const phone = (body.phone ?? '').trim();
    const password = body.password ?? '';
    const nickname = (body.nickname ?? '').trim();

    if (!isPhone(phone)) {
      throw new AppError('VALIDATION_ERROR', 400, '请输入正确的 11 位手机号');
    }
    if (!isStrongPassword(password)) {
      throw new AppError('VALIDATION_ERROR', 400, '密码至少 8 位，且需包含字母和数字');
    }
    if (!isNickname(nickname)) {
      throw new AppError('VALIDATION_ERROR', 400, '昵称需 2–20 个字符');
    }

    const exists = await queryOne<{ id: string }>(
      `SELECT id FROM app_user WHERE phone = $1`,
      [phone]
    );
    if (exists) {
      throw new AppError('PHONE_TAKEN', 409, '该手机号已注册，请直接登录');
    }

    // 邀请码决定角色：仅当环境变量配置了 ADMIN_INVITE_CODE 且匹配才给 ADMIN
    const adminCode = process.env.ADMIN_INVITE_CODE;
    const role = adminCode && body.adminCode === adminCode ? 'ADMIN' : 'USER';

    const userId = newId('u');
    const passwordHash = await hashPassword(password);

    await query(
      `INSERT INTO app_user(id, nickname, phone, password_hash, role, status, last_login_at)
       VALUES ($1,$2,$3,$4,$5,'ACTIVE', now())`,
      [userId, nickname, phone, passwordHash, role]
    );
    await query(
      `INSERT INTO credit_account(user_id, score) VALUES($1,100) ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );

    const sess = await createSession(userId, {
      userAgent: req.headers.get('user-agent'),
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    });

    const res = NextResponse.json({
      success: true,
      data: {
        user: { id: userId, nickname, phone, role, avatarEmoji: '🧑‍🌾', creditScore: 100 },
      },
    });
    res.headers.append('Set-Cookie', sessionCookieHeader(sess.token, sess.expiresAt));
    return res;
  } catch (e) {
    return handleError(e);
  }
}
