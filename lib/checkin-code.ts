/**
 * 核销码。
 *
 * 两种码，用途不同：
 *  1) 二维码 token：HMAC 签名，含 activityId + registrationId + expireAt。
 *     只做验签，**不存明文**（库里存 token 的 hash 摘要）。
 *  2) 6 位数字码：给主理人手动核销时比对/回显用，AES-256-GCM 加密存库，
 *     可解密回显但非明文落库。
 */
import crypto from 'node:crypto';
import { CHECKIN_CLOSE_AFTER } from './clock';

function tokenSecret(): string {
  const s = process.env.CHECKIN_TOKEN_SECRET;
  if (!s) throw new Error('CHECKIN_TOKEN_SECRET 未配置');
  return s;
}

function codeKey(): Buffer {
  const k = process.env.CHECKIN_CODE_KEY;
  if (!k) throw new Error('CHECKIN_CODE_KEY 未配置');
  // 32 字节密钥；不足则 hash 补齐
  return crypto.createHash('sha256').update(k).digest();
}

// ---------------------------------------------------------------------------
// 二维码 token
// ---------------------------------------------------------------------------

export function generateCheckinToken(input: {
  activityId: string;
  registrationId: string;
  expireAt: Date;
}): string {
  const payload = `${input.activityId}.${input.registrationId}.${input.expireAt.getTime()}`;
  const sig = crypto
    .createHmac('sha256', tokenSecret())
    .update(payload)
    .digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export type VerifyResult =
  | { ok: true; activityId: string; registrationId: string; expireAt: Date }
  | { ok: false; reason: 'INVALID' | 'EXPIRED' };

export function verifyCheckinToken(token: string, now: Date = new Date()): VerifyResult {
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'INVALID' };

  let payload: string;
  try {
    payload = Buffer.from(parts[0], 'base64url').toString('utf8');
  } catch {
    return { ok: false, reason: 'INVALID' };
  }

  const expected = crypto
    .createHmac('sha256', tokenSecret())
    .update(payload)
    .digest('base64url');

  // 定长比较，避免时序侧信道
  const a = Buffer.from(expected);
  const b = Buffer.from(parts[1]);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'INVALID' };
  }

  const [activityId, registrationId, expireMs] = payload.split('.');
  if (!activityId || !registrationId || !expireMs) {
    return { ok: false, reason: 'INVALID' };
  }

  const expireAt = new Date(Number(expireMs));
  if (Number.isNaN(expireAt.getTime())) return { ok: false, reason: 'INVALID' };
  if (now.getTime() > expireAt.getTime()) return { ok: false, reason: 'EXPIRED' };

  return { ok: true, activityId, registrationId, expireAt };
}

// ---------------------------------------------------------------------------
// 6 位数字码（AES-256-GCM）
// ---------------------------------------------------------------------------

export function generateShortCode(): string {
  // 100000-999999，避免前导零带来的位数歧义
  return String(crypto.randomInt(100000, 1000000));
}

export function encryptShortCode(code: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', codeKey(), iv);
  const enc = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${enc.toString('base64url')}.${tag.toString('base64url')}`;
}

export function decryptShortCode(cipherText: string): string | null {
  try {
    const [ivB64, encB64, tagB64] = cipherText.split('.');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      codeKey(),
      Buffer.from(ivB64, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(encB64, 'base64url')),
      decipher.final(),
    ]);
    return dec.toString('utf8');
  } catch {
    return null;
  }
}

/** 生成一套核销码物料 */
export function buildCheckinMaterial(input: {
  activityId: string;
  registrationId: string;
  startAt: Date;
}): { token: string; tokenHash: string; code: string; codeCipher: string; expireAt: Date } {
  const expireAt = new Date(input.startAt.getTime() + CHECKIN_CLOSE_AFTER);
  const token = generateCheckinToken({ ...input, expireAt });
  const code = generateShortCode();
  return {
    token,
    tokenHash: hashToken(token),
    code,
    codeCipher: encryptShortCode(code),
    expireAt,
  };
}
