import crypto from 'node:crypto';

/**
 * 支付回调验签。
 * 签名算法：HMAC-SHA256(secret, timestamp + '.' + rawBody)
 * 时间戳容差 5 分钟，防重放。
 */
export const CALLBACK_TOLERANCE_MS = 5 * 60_000;

export type VerifyOutcome =
  | { ok: true }
  | { ok: false; reason: 'MISSING' | 'INVALID' | 'EXPIRED' };

export function signCallback(raw: string, timestamp: string): string {
  const secret = process.env.PAY_CALLBACK_SECRET ?? '';
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
}

export function verifyCallbackSignature(input: {
  raw: string;
  signature: string | null;
  timestamp: string | null;
  now?: number;
  /** 测试绕过开关：显式置 true 才能跳过，防止误放开 */
  skip?: boolean;
}): VerifyOutcome {
  if (input.skip) return { ok: true };
  if (!input.signature || !input.timestamp) return { ok: false, reason: 'MISSING' };

  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'INVALID' };

  const now = input.now ?? Date.now();
  if (Math.abs(now - ts) > CALLBACK_TOLERANCE_MS) return { ok: false, reason: 'EXPIRED' };

  const expected = signCallback(input.raw, input.timestamp);
  const a = Buffer.from(expected);
  const b = Buffer.from(input.signature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'INVALID' };
  }
  return { ok: true };
}
