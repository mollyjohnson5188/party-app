/**
 * 认证核心：密码哈希 + Session 票据。
 *
 * 设计取舍：
 *  - 密码用 scrypt（Node 内置 crypto，无第三方依赖），每用户独立 salt
 *  - Session 用数据库表存储，token 只存 sha256 摘要（库泄露也无法直接复用）
 *  - Cookie 为 httpOnly + sameSite=lax，前端 JS 读不到，杜绝 XSS 窃取
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: typeof SCRYPT_OPTS
) => Promise<Buffer>;

const KEYLEN = 64;

/**
 * 注意：scrypt 默认 maxmem 为 32MB，N=16384 时实际需要约 32MB 会报错，
 * 显式放宽到 64MB。
 */
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** 生成 `scrypt$<saltHex>$<hashHex>` 格式的密码摘要 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(plain.normalize('NFKC'), salt, KEYLEN, SCRYPT_OPTS);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/** 恒定时间比较，避免时序侧信道 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  if (expected.length !== KEYLEN) return false;
  const derived = await scrypt(plain.normalize('NFKC'), salt, KEYLEN, SCRYPT_OPTS);
  return timingSafeEqual(derived, expected);
}

/** 生成 Session 原始 token（发给客户端）与其摘要（入库） */
export function newSessionToken(): { token: string; digest: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, digest: sha256(token) };
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export const SESSION_COOKIE = 'gj_session';
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // 30 天

/** 手机号：中国大陆 11 位 */
export function isPhone(s: string): boolean {
  return /^1[3-9]\d{9}$/.test(s);
}

/** 昵称长度与字符校验 */
export function isNickname(s: string): boolean {
  return s.trim().length >= 2 && s.trim().length <= 20;
}

/** 密码强度：至少 8 位，且包含字母与数字 */
export function isStrongPassword(s: string): boolean {
  return s.length >= 8 && /[a-zA-Z]/.test(s) && /\d/.test(s);
}
