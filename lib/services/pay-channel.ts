/**
 * 支付通道抽象。
 *
 * 契约要点（实现方必须满足）：
 *  - createHold / release / forfeit 都必须接受 bizId 作为幂等键，
 *    同一 bizId 重复调用只能产生一次真实资金动作。
 *  - 所有方法返回 channelTxnId，我方落库后可追溯。
 */

export interface CreateHoldInput {
  bizId: string;
  amount: number;
  userId: string;
  activityId: string;
  description: string;
}

export interface ReleaseInput {
  bizId: string;
  holdId: string;
  amount: number;
  reason: string;
}

export interface ForfeitInput {
  bizId: string;
  holdId: string;
  amount: number;
  /** 收款方：MVP 全额进入平台补偿专户，后续由平台按明细线下打款 */
  payee: { type: 'PLATFORM_COMPENSATION'; accountId: string };
  reason: string;
}

export interface ChannelResult {
  success: boolean;
  channelTxnId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface PayChannel {
  readonly name: string;
  createHold(input: CreateHoldInput): Promise<ChannelResult>;
  closeHold(input: { holdId: string }): Promise<ChannelResult>;
  release(input: ReleaseInput): Promise<ChannelResult>;
  forfeit(input: ForfeitInput): Promise<ChannelResult>;
}
