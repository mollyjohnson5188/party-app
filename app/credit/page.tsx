'use client';

import { useEffect, useState } from 'react';
import { api, fmtTime } from '@/lib/client';
import { Spinner } from '@/components/ui';

interface Me {
  score: number;
  level: string;
  checkinCount: number;
  noShowCount: number;
  lateCancelCount: number;
}

interface Ledger {
  id: string;
  eventType: string;
  delta: number;
  nominalDelta: number;
  beforeScore: number;
  afterScore: number;
  reason: string | null;
  createdAt: string;
}

const EVENT_LABEL: Record<string, string> = {
  INIT: '初始信用',
  CHECK_IN: '成行到场',
  NO_SHOW: '爽约',
  LATE_CANCEL: '临时取消',
  APPEAL_REVERT: '申诉回滚',
  ADMIN_ADJUST: '管理员调整',
};

const LEVEL_LABEL: Record<string, string> = {
  EXCELLENT: '优秀',
  NORMAL: '正常',
  LIMITED: '受限',
};

export default function CreditPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [rows, setRows] = useState<Ledger[] | null>(null);

  useEffect(() => {
    api<Me>('/api/credit/me').then(setMe).catch(() => {});
    api<Ledger[]>('/api/credit/ledger?limit=50')
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  const pct = me ? Math.round((me.score / 120) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <h1 className="text-[22px] font-semibold tracking-tight">信用中心</h1>
      <p className="mt-1.5 text-[13px] text-muted">
        信用分只与履约行为有关，不参与定价，也不与保证金金额挂钩。
      </p>

      {!me && (
        <div className="py-12">
          <Spinner />
        </div>
      )}

      {me && (
        <div className="mt-5 grid gap-3 sm:grid-cols-[1.4fr_1fr]">
          <div className="card p-5">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[12px] text-muted">当前信用分</p>
                <p className="mt-1 text-[40px] font-semibold leading-none tabular tracking-tight">
                  {me.score}
                  <span className="ml-1 text-[13px] font-normal text-muted">/ 120</span>
                </p>
              </div>
              <span
                className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                  me.level === 'EXCELLENT'
                    ? 'border-moss-200 bg-moss-50 text-moss-700'
                    : me.level === 'NORMAL'
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {LEVEL_LABEL[me.level] ?? me.level}
              </span>
            </div>

            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-stone-100">
              <div className="h-full rounded-full bg-moss-500" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[10.5px] text-stone-400">
              <span>0</span>
              <span>80 正常线</span>
              <span>100 优秀线</span>
              <span>120</span>
            </div>
          </div>

          <div className="card grid grid-cols-3 divide-x divide-stone-100 sm:grid-cols-1 sm:divide-x-0 sm:divide-y">
            <Stat label="成行" value={me.checkinCount} tone="moss" />
            <Stat label="爽约" value={me.noShowCount} tone="red" />
            <Stat label="临时取消" value={me.lateCancelCount} tone="amber" />
          </div>
        </div>
      )}

      <div className="card mt-3 p-4">
        <p className="text-[12px] leading-relaxed text-muted">
          <span className="font-medium text-ink">规则速览</span>
          ：成行 +1（活动结束后统一结算）· 爽约 −10（T0+120 分钟自动判定）·
          T0−12 小时内取消 −2 · 提前 12 小时以上取消不扣分 · 活动取消不影响任何参与者信用 ·
          申诉通过加回被扣分数（每单仅一次）。
        </p>
      </div>

      <h2 className="mt-7 mb-3 text-[15px] font-semibold">变动记录</h2>
      {!rows && <Spinner />}
      {rows && rows.length === 0 && (
        <div className="card p-6 text-center text-[13px] text-muted">暂无记录</div>
      )}
      <div className="card divide-y divide-stone-100 overflow-hidden">
        {rows?.map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-4 py-3">
            <span
              className={`w-11 shrink-0 text-right text-[13px] font-medium tabular ${
                r.delta > 0 ? 'text-moss-600' : r.delta < 0 ? 'text-red-600' : 'text-stone-400'
              }`}
            >
              {r.delta > 0 ? `+${r.delta}` : r.delta}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px]">{EVENT_LABEL[r.eventType] ?? r.eventType}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted">
                {r.reason ?? '—'}
                {r.delta !== r.nominalDelta && (
                  <span className="ml-1.5 text-stone-400">
                    （规则 {r.nominalDelta}，受分数上下限钳制）
                  </span>
                )}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[11px] tabular text-muted">
                {r.beforeScore} → {r.afterScore}
              </p>
              <p className="text-[10.5px] text-stone-400">{fmtTime(r.createdAt)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  const color =
    tone === 'moss' ? 'text-moss-600' : tone === 'red' ? 'text-red-600' : 'text-amber-600';
  return (
    <div className="px-4 py-3 sm:flex sm:items-center sm:justify-between">
      <span className="text-[11.5px] text-muted">{label}</span>
      <span className={`text-[17px] font-semibold tabular ${color}`}>{value}</span>
    </div>
  );
}
