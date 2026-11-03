import type {
  PayChannel,
  CreateHoldInput,
  ReleaseInput,
  ForfeitInput,
  ChannelResult,
} from './pay-channel';

/**
 * Mock 通道：用于本地开发与测试。
 * 支持注入失败，验证重试逻辑。
 */
export class MockPayChannel implements PayChannel {
  readonly name = 'mock';
  private seq = 0;

  /** 让接下来的 N 次 release 失败 */
  failReleaseTimes = 0;
  /** 让接下来的 N 次 forfeit 失败 */
  failForfeitTimes = 0;
  /** 记录所有真实资金动作，用于断言"只发起一次" */
  calls: { type: 'hold' | 'release' | 'forfeit' | 'close'; bizId: string }[] = [];

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${Date.now()}_${this.seq}`;
  }

  async createHold(input: CreateHoldInput): Promise<ChannelResult> {
    this.calls.push({ type: 'hold', bizId: input.bizId });
    return { success: true, channelTxnId: this.nextId('hold') };
  }

  async closeHold(input: { holdId: string }): Promise<ChannelResult> {
    this.calls.push({ type: 'close', bizId: input.holdId });
    return { success: true, channelTxnId: this.nextId('close') };
  }

  async release(input: ReleaseInput): Promise<ChannelResult> {
    this.calls.push({ type: 'release', bizId: input.bizId });
    if (this.failReleaseTimes > 0) {
      this.failReleaseTimes -= 1;
      return {
        success: false,
        errorCode: 'CHANNEL_TIMEOUT',
        errorMessage: '通道超时（模拟）',
      };
    }
    return { success: true, channelTxnId: this.nextId('rel') };
  }

  async forfeit(input: ForfeitInput): Promise<ChannelResult> {
    this.calls.push({ type: 'forfeit', bizId: input.bizId });
    if (this.failForfeitTimes > 0) {
      this.failForfeitTimes -= 1;
      return {
        success: false,
        errorCode: 'CHANNEL_TIMEOUT',
        errorMessage: '通道超时（模拟）',
      };
    }
    return { success: true, channelTxnId: this.nextId('ff') };
  }

  countOf(type: 'hold' | 'release' | 'forfeit' | 'close'): number {
    return this.calls.filter((c) => c.type === type).length;
  }
}
