import type { PayChannel } from './pay-channel';
import { MockPayChannel } from './pay-channel.mock';

/**
 * 通道注册表。
 * 真实接入时在此注册 wechat_epay / alipay_papay 实现，业务层无需改动。
 */
const registry = new Map<string, PayChannel>();

export function registerChannel(name: string, ch: PayChannel): void {
  registry.set(name, ch);
}

export function getChannel(name?: string): PayChannel {
  const key = name ?? process.env.PAY_CHANNEL ?? 'mock';
  const ch = registry.get(key);
  if (ch) return ch;
  if (key === 'mock') {
    const mock = new MockPayChannel();
    registry.set('mock', mock);
    return mock;
  }
  throw new Error(`支付通道未注册：${key}`);
}

let defaultChannel: PayChannel | null = null;

export function getDefaultChannel(): PayChannel {
  if (!defaultChannel) defaultChannel = getChannel();
  return defaultChannel;
}

export function setDefaultChannel(ch: PayChannel): void {
  defaultChannel = ch;
  registerChannel(ch.name, ch);
}
