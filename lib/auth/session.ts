/**
 * Session 服务：创建 / 校验 / 吊销。
 * 所有会话查询都走数据库，登出即失效，无需担心 JWT 无法召回的问题。
 */
import { query, queryOne } from '@/lib/db';
import { newId } from '@/lib/id';
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  newSessionToken,
  sha256,
} from '@/lib/auth/password';

export interface SessionUser {
  id: string;
  nickname: string;
  phone: string | null;
  role: 'USER' | 'ADMIN';
  status: string;
  avatarEmoji: string;
}

export interface AuthResult {
  user: SessionUser;
  sessionId: string;
}

/** 从 Cookie 头解析 token */
export function readSessionToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null }
): Promise<{ token: string; expiresAt: Date; sessionId: string }> {
  const { token, digest } = newSessionToken();
  const id = newId('sess');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await query(
    `INSERT INTO user_session(id, user_id, token_digest, user_agent, ip, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, userId, digest, meta.userAgent?.slice(0, 255) ?? null, meta.ip ?? null, expiresAt]
  );

  return { token, expiresAt, sessionId: id };
}

/** 校验 session token，返回用户；过期或已吊销返回 null */
export async function resolveSession(cookieHeader: string | null): Promise<AuthResult | null> {
  const token = readSessionToken(cookieHeader);
  if (!token) return null;

  const row = await queryOne<{
    session_id: string;
    id: string;
    nickname: string;
    phone: string | null;
    role: string;
    status: string;
    avatar_emoji: string;
    expires_at: Date;
    revoked_at: Date | null;
    user_status: string;
  }>(
    `SELECT s.id AS session_id, u.id, u.nickname, u.phone, u.role, u.status,
            u.avatar_emoji, s.expires_at, s.revoked_at, u.status AS user_status
       FROM user_session s JOIN app_user u ON u.id = s.user_id
      WHERE s.token_digest = $1`,
    [sha256(token)]
  );

  if (!row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;
  if (row.user_status !== 'ACTIVE') return null;

  return {
    sessionId: row.session_id,
    user: {
      id: row.id,
      nickname: row.nickname,
      phone: row.phone,
      role: row.role === 'ADMIN' ? 'ADMIN' : 'USER',
      status: row.status,
      avatarEmoji: row.avatar_emoji ?? '🧑‍🌾',
    },
  };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await query(`UPDATE user_session SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [
    sessionId,
  ]);
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await query(
    `UPDATE user_session SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
}

/** 构造 Set-Cookie 头 */
export function sessionCookieHeader(token: string, expiresAt: Date): string {
  const sec = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${sec}`,
  ];
  // 生产（https）才加 Secure
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

export function clearCookieHeader(): string {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}
