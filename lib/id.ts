import { randomBytes } from 'node:crypto';

/**
 * 短 ID 生成器。表结构里 id 为 VARCHAR(32)，不可直接用 UUID(36)。
 * 前缀 + 时间戳 base36 + 随机 6 字符，保证可读且不易冲突。
 */
export function newId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rnd = randomBytes(4).toString('hex');
  return `${prefix}_${ts}${rnd}`;
}
