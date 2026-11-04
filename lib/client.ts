/**
 * 前端 API 客户端。
 * 演示环境用 localStorage 保存当前登录用户，所有请求带 X-User-Id。
 */
'use client';

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  code?: string;
  message?: string;
  detail?: Record<string, unknown>;
}

export const DEMO_USERS = [
  { id: 'u_zhang', name: '张一鸣', role: '参与者', credit: 100 },
  { id: 'u_li', name: '李思远', role: '参与者', credit: 96 },
  { id: 'u_wang', name: '王星然', role: '参与者', credit: 100 },
  { id: 'u_chen', name: '陈慕白', role: '参与者（有爽约记录）', credit: 90 },
  { id: 'u_host', name: '林间行者', role: '主理人', credit: 100 },
  { id: 'u_admin', name: '平台运营', role: '管理员', credit: 100 },
];

const KEY = 'party.currentUser';

export function getCurrentUserId(): string {
  if (typeof window === 'undefined') return 'u_zhang';
  return localStorage.getItem(KEY) ?? 'u_zhang';
}

export function setCurrentUserId(id: string): void {
  localStorage.setItem(KEY, id);
  window.dispatchEvent(new Event('party:user-changed'));
}

export async function api<T>(
  path: string,
  init: RequestInit & { role?: string } = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');

  // 登录态走 httpOnly Cookie，前端不再自报 userId（旧演示头仅作本地兜底）
  if (typeof window !== 'undefined' && !localStorage.getItem('party.currentUser')) {
    // 未设置过演示身份时不发头，依赖真实 Session
  } else if (typeof window !== 'undefined') {
    headers.set('x-user-id', getCurrentUserId());
  }

  const res = await fetch(path, {
    ...init,
    headers,
    cache: 'no-store',
    credentials: 'include',
  });
  const json = (await res.json()) as ApiEnvelope<T>;

  if (!json.success) {
    const err = new Error(json.message ?? json.code ?? '请求失败') as Error & {
      code?: string;
      detail?: Record<string, unknown>;
    };
    err.code = json.code;
    err.detail = json.detail;
    throw err;
  }
  return json.data as T;
}

export async function apiPost<T>(path: string, body?: unknown, role?: string): Promise<T> {
  return api<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}), role });
}

// ---------------------------------------------------------------------------
// 格式化
// ---------------------------------------------------------------------------

export function fmtMoney(cents: number): string {
  if (cents === 0) return '免费';
  return `¥${(cents / 100).toFixed(2).replace(/\.00$/, '')}`;
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function fmtHHmm(iso: string): string {
  return new Date(iso).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function relTime(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const H = 3_600_000;
  const D = 24 * H;
  const sign = diff >= 0 ? '' : '已过 ';
  if (abs < H) return `${sign}${Math.round(abs / 60_000)} 分钟${diff >= 0 ? '后' : '前'}`;
  if (abs < D) return `${sign}${Math.round(abs / H)} 小时${diff >= 0 ? '后' : '前'}`;
  return `${sign}${Math.round(abs / D)} 天${diff >= 0 ? '后' : '前'}`;
}

export const STATUS_LABEL: Record<string, { text: string; tone: string }> = {
  PENDING_PAYMENT: { text: '待支付保证金', tone: 'amber' },
  CONFIRMED: { text: '已报名', tone: 'moss' },
  CHECKED_IN: { text: '已到场', tone: 'moss' },
  NO_SHOW: { text: '爽约', tone: 'red' },
  CANCELLED_BY_USER: { text: '已取消', tone: 'gray' },
  CANCELLED_BY_HOST: { text: '主理人取消', tone: 'gray' },
  CANCELLED_BY_SYSTEM: { text: '系统取消', tone: 'gray' },
  UNUSED: { text: '未核销', tone: 'gray' },
  NO_SHOW_CANDIDATE: { text: '爽约候选', tone: 'amber' },
  HELD: { text: '保证金已冻结', tone: 'moss' },
  PAYING: { text: '待支付', tone: 'amber' },
  RELEASING: { text: '退款中', tone: 'amber' },
  RELEASED: { text: '已全额退还', tone: 'moss' },
  FORFEITED: { text: '已扣划补偿', tone: 'red' },
  FORFEIT_PENDING: { text: '扣划中', tone: 'amber' },
  CANCELLED: { text: '已关闭', tone: 'gray' },
  FAILED: { text: '处理失败', tone: 'red' },
  PUBLISHED: { text: '报名中', tone: 'moss' },
  ONGOING: { text: '进行中', tone: 'moss' },
  FINISHED: { text: '已结束', tone: 'gray' },
  DRAFT: { text: '草稿', tone: 'gray' },
};
