'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, fmtMoney, fmtTime, relTime, STATUS_LABEL } from '@/lib/client';
import { Badge, EmptyState, Spinner } from '@/components/ui';

interface ActivityItem {
  id: string;
  title: string;
  location: string;
  startAt: string;
  endAt: string;
  capacity: number;
  joined: number;
  status: string;
  guaranteeMode: 'NONE' | 'GUARANTEE';
  guaranteeAmount: number;
  minCreditScore: number;
  hostName: string;
  myStatus: string | null;
}

export default function HomePage() {
  const [list, setList] = useState<ActivityItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<ActivityItem[]>('/api/activities')
      .then(setList)
      .catch((e) => setErr(e.message));
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-5">
      <section className="pt-12 pb-10">
        <p className="mb-3 text-[12px] font-medium uppercase tracking-[0.18em] text-moss-600">
          OUTDOOR · AFTER WORK
        </p>
        <h1 className="max-w-2xl text-[34px] font-semibold leading-[1.2] tracking-tight text-ink sm:text-[40px]">
          下班之后的
          <br />
          第二生活现场
        </h1>
        <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-muted">
          保证金只是承诺，不是收入。到场核销，钱原路全额退回；真的没来，
          这笔钱会分给那些按时到了的人。
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-moss-500" />
            到场即全额退保证金
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-clay-400" />
            平台不截留任何扣款
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-stone-400" />
            T0+120 分钟自动判定爽约
          </span>
        </div>
      </section>

      <section className="pb-12">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[17px] font-semibold tracking-tight">近期组局</h2>
          <span className="text-[12px] text-muted">{list ? `${list.length} 个活动` : ''}</span>
        </div>

        {err && (
          <div className="card p-5 text-sm text-red-600">
            {err}
            <p className="mt-2 text-xs leading-relaxed text-muted">
              若为数据库未初始化，请先执行迁移，再调用 POST /api/dev/seed 灌演示数据。
            </p>
          </div>
        )}

        {!list && !err && (
          <div className="py-10">
            <Spinner label="正在加载组局" />
          </div>
        )}

        {list && list.length === 0 && (
          <EmptyState
            title="还没有组局"
            hint="切换到主理人身份，去「主理人台」发起第一个活动。"
          />
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {list?.map((a) => {
            const remain = a.capacity - a.joined;
            const pct = Math.min(100, Math.round((a.joined / a.capacity) * 100));
            const st = a.myStatus ? STATUS_LABEL[a.myStatus] : null;
            return (
              <Link
                key={a.id}
                href={`/activity/${a.id}`}
                className="card group flex flex-col p-5 transition-all hover:-translate-y-0.5 hover:border-moss-300 hover:shadow-[0_6px_24px_-12px_rgba(31,52,29,0.25)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[15px] font-semibold leading-snug tracking-tight group-hover:text-moss-700">
                    {a.title}
                  </h3>
                  {st && <Badge text={st.text} tone={st.tone as 'moss'} />}
                </div>

                <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-muted">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" strokeLinejoin="round" />
                    <circle cx="12" cy="10" r="2.4" />
                  </svg>
                  {a.location}
                </p>

                <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-muted">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7.5V12l3 2" strokeLinecap="round" />
                  </svg>
                  {fmtTime(a.startAt)} · {relTime(a.startAt)}
                </p>

                <div className="mt-auto pt-4">
                  <div className="mb-2 h-1 overflow-hidden rounded-full bg-stone-100">
                    <div className="h-full rounded-full bg-moss-400/80" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-muted">
                      已报 {a.joined}/{a.capacity}
                      {remain > 0 && remain <= 2 && (
                        <span className="ml-1.5 text-amber-600">仅剩 {remain} 位</span>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      {a.minCreditScore > 0 && (
                        <span className="text-[11px] text-stone-400">信用 ≥{a.minCreditScore}</span>
                      )}
                      <span className="font-medium tabular text-ink">
                        {a.guaranteeMode === 'GUARANTEE'
                          ? `保证金 ${fmtMoney(a.guaranteeAmount)}`
                          : '免费占位'}
                      </span>
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
