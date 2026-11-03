'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, apiPost, fmtMoney, fmtTime, STATUS_LABEL } from '@/lib/client';
import { Badge, Spinner, Toast } from '@/components/ui';

interface Act {
  id: string;
  title: string;
  location: string;
  startAt: string;
  capacity: number;
  joined: number;
  status: string;
  guaranteeMode: 'NONE' | 'GUARANTEE';
  guaranteeAmount: number;
}

const JOBS = [
  { key: 'noShowCandidateJob', label: 'T0+60 爽约候选扫描', hint: '每 5 分钟' },
  { key: 'noShowFinalizeJob', label: 'T0+120 爽约判定与扣划', hint: '每 5 分钟' },
  { key: 'creditSettleJob', label: '成行加分结算', hint: '每日' },
  { key: 'paymentRetryJob', label: '退款/扣划重试', hint: '每 10 分钟' },
];

export default function HostPage() {
  const [acts, setActs] = useState<Act[] | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: 'moss' | 'red' | 'amber' } | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Act[]>('/api/activities').then(setActs).catch(() => setActs([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runJob(key: string) {
    setRunning(key);
    try {
      const r = await apiPost<{ jobName: string; affected: number }>(`/api/cron/${key}`);
      setToast({ msg: `${r.jobName} 执行完成，影响 ${r.affected} 条`, tone: 'moss' });
      load();
    } catch (e) {
      setToast({ msg: (e as Error).message, tone: 'red' });
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <h1 className="text-[22px] font-semibold tracking-tight">主理人台</h1>
      <p className="mt-1.5 text-[13px] text-muted">
        核销、取消与保证金处理都在这里。同一报名单的重复操作会幂等返回，不会重复退款。
      </p>

      <h2 className="mt-7 mb-3 text-[15px] font-semibold">我的活动</h2>
      {!acts && <Spinner />}
      <div className="space-y-2.5">
        {acts?.map((a) => {
          const st = STATUS_LABEL[a.status] ?? { text: a.status, tone: 'gray' };
          return (
            <Link
              key={a.id}
              href={`/activity/${a.id}`}
              className="card flex items-center gap-4 p-4 transition-colors hover:border-moss-300"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{a.title}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[12px] text-muted">
                  <span>{fmtTime(a.startAt)}</span>
                  <span>{a.location}</span>
                  <span className="tabular">
                    {a.joined}/{a.capacity} 人
                  </span>
                  <span className="tabular">
                    {a.guaranteeMode === 'GUARANTEE'
                      ? `保证金 ${fmtMoney(a.guaranteeAmount)}`
                      : '免费'}
                  </span>
                </p>
              </div>
              <Badge text={st.text} tone={st.tone as 'moss'} />
            </Link>
          );
        })}
      </div>

      <h2 className="mt-8 mb-1 text-[15px] font-semibold">定时任务</h2>
      <p className="mb-3 text-[12px] leading-relaxed text-muted">
        生产环境由调度器按频率触发。这里是手动触发入口，用于演示与排障。
        所有任务都做了幂等处理，重复执行不会重复扣款或重复扣分。
      </p>
      <div className="card divide-y divide-stone-100 overflow-hidden">
        {JOBS.map((j) => (
          <div key={j.key} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px]">{j.label}</p>
              <p className="mt-0.5 text-[11px] text-muted">
                {j.key} · {j.hint}
              </p>
            </div>
            <button
              className="btn btn-ghost !py-1.5 !text-[12px]"
              disabled={running === j.key}
              onClick={() => runJob(j.key)}
            >
              {running === j.key ? '执行中…' : '立即执行'}
            </button>
          </div>
        ))}
      </div>

      <div className="card mt-3 bg-stone-50/60 p-4">
        <p className="text-[12px] leading-relaxed text-muted">
          <span className="font-medium text-ink">关于资金</span>：平台不代收活动费用，只处理保证金。
          退款走持牌通道的冻结/预授权释放，全额原路退回；爽约扣款全额进入守约补偿池，
          按到场人数均分，余数给最早核销者，平台不截留也不收服务费。
        </p>
      </div>

      {toast && <Toast message={toast.msg} tone={toast.tone} onClose={() => setToast(null)} />}
    </div>
  );
}
