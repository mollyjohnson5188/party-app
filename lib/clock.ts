/**
 * 可注入时钟。
 *
 * 业务代码**禁止**直接调用 new Date() —— 所有时间判断（T0-12h、
 * T0+60min、T0+120min、24h 申诉窗口）必须通过 clock.now() 取，
 * 否则边界测试无法精确验证。
 */

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/** 测试用可控时钟 */
export class FakeClock implements Clock {
  private current: number;

  constructor(iso: string | Date) {
    this.current = new Date(iso).getTime();
  }

  now(): Date {
    return new Date(this.current);
  }

  /** 前进若干毫秒 */
  advance(ms: number): void {
    this.current += ms;
  }

  advanceMinutes(min: number): void {
    this.current += min * 60_000;
  }

  advanceHours(h: number): void {
    this.current += h * 3_600_000;
  }

  set(iso: string | Date): void {
    this.current = new Date(iso).getTime();
  }
}

let activeClock: Clock = systemClock;

export function getClock(): Clock {
  return activeClock;
}

/** 仅测试环境与启动引导使用 */
export function setClock(c: Clock): void {
  activeClock = c;
}

export function resetClock(): void {
  activeClock = systemClock;
}

// ---------------------------------------------------------------------------
// 业务时间常量（唯一出处，禁止散落魔法数字）
// ---------------------------------------------------------------------------
export const MIN = 60_000;
export const HOUR = 60 * MIN;

/** 核销窗口起点：T0 - 60 分钟 */
export const CHECKIN_OPEN_BEFORE = 60 * MIN;
/** 核销窗口终点 / 自动判爽约：T0 + 120 分钟 */
export const CHECKIN_CLOSE_AFTER = 120 * MIN;
/** 爽约候选：T0 + 60 分钟 */
export const NO_SHOW_CANDIDATE_AFTER = 60 * MIN;
/** 迟到取消线：T0 - 12 小时 */
export const LATE_CANCEL_BEFORE = 12 * HOUR;
/** 支付超时：15 分钟 */
export const PAYMENT_TIMEOUT = 15 * MIN;
/** 申诉窗口：活动结束后 24 小时 */
export const APPEAL_WINDOW = 24 * HOUR;
/** 退款重试间隔：10 分钟 */
export const RETRY_INTERVAL = 10 * MIN;
/** 退款最大重试次数 */
export const MAX_RETRY = 6;

export function addMs(d: Date, ms: number): Date {
  return new Date(d.getTime() + ms);
}

export function isWithinCheckinWindow(now: Date, startAt: Date): boolean {
  const open = startAt.getTime() - CHECKIN_OPEN_BEFORE;
  const close = startAt.getTime() + CHECKIN_CLOSE_AFTER;
  const t = now.getTime();
  // 闭区间，含两端点
  return t >= open && t <= close;
}
