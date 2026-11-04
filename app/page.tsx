'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, fmtMoney, fmtTime, relTime, STATUS_LABEL } from '@/lib/client';
import { Badge, EmptyState, Spinner } from '@/components/ui';
import { getTheme } from '@/lib/themes';
import { CATEGORIES, getCategory } from '@/lib/categories';

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
  theme?: string | null;
  category?: string | null;
}

export default function HomePage() {
  const [list, setList] = useState<ActivityItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cat, setCat] = useState<string>('ALL');
  const [onlySeats, setOnlySeats] = useState(false);
  const [onlyGuarantee, setOnlyGuarantee] = useState(false);

  useEffect(() => {
    api<ActivityItem[]>('/api/activities')
      .then(setList)
      .catch((e) => setErr(e.message));
  }, []);

  // 分类计数（基于全量，不随筛选变化）
  const counts: Record<string, number> = {};
  for (const a of list ?? []) {
    const k = a.category ?? 'OTHER';
    counts[k] = (counts[k] ?? 0) + 1;
  }

  const filtered = (list ?? []).filter((a) => {
    if (cat !== 'ALL' && (a.category ?? 'OTHER') !== cat) return false;
    if (onlySeats && a.joined >= a.capacity) return false;
    if (onlyGuarantee && a.guaranteeMode !== 'GUARANTEE') return false;
    return true;
  });

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
          <span className="text-[12px] text-muted">
            {list ? `${filtered.length} 个活动${cat !== 'ALL' || onlySeats || onlyGuarantee ? '（已筛选）' : ''}` : ''}
          </span>
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

        {list && filtered.length === 0 && list.length > 0 && (
          <div className="card p-8 text-center">
            <p className="text-[14px] text-muted">这个分类下暂时没有组局</p>
            <button
              className="btn btn-ghost mt-3 !text-[12.5px]"
              onClick={() => {
                setCat('ALL');
                setOnlySeats(false);
                setOnlyGuarantee(false);
              }}
            >
              查看全部组局
            </button>
          </div>
        )}

        {list && list.length === 0 && (
          <EmptyState
            title="还没有组局"
            hint="切换到主理人身份，去「主理人台」发起第一个活动。"
          />
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((a) => {
            const remain = a.capacity - a.joined;
            const pct = Math.min(100, Math.round((a.joined / a.capacity) * 100));
            const st = a.myStatus ? STATUS_LABEL[a.myStatus] : null;
            const th = getTheme(a.theme);
            return (
              <Link
                key={a.id}
                href={`/activity/${a.id}`}
                className="card group flex flex-col overflow-hidden p-0 transition-all hover:-translate-y-0.5 hover:border-moss-300 hover:shadow-[0_6px_24px_-12px_rgba(31,52,29,0.25)]"
              >
                <div
                  className="flex h-[76px] items-end justify-between px-5 pb-2"
                  style={{ background: th.gradient }}
                >
                  <span className="text-[22px]" style={{ filter: th.dark ? 'brightness(0) invert(1)' : 'none' }}>{th.emoji}</span>
                  <span
                    className="rounded-full bg-white/45 px-2 py-0.5 text-[10.5px] font-medium backdrop-blur-sm"
                    style={{ color: th.dark ? '#fff' : th.accent }}
                  >
                    {th.label}
                  </span>
                </div>
                <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
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
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ============ 分类筛选 ============ */}
      <section className="border-t border-stone-200/70 pb-16 pt-8">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-[17px] font-semibold tracking-tight">按类型找组局</h2>
          <span className="text-[12px] text-muted">选一类，只看你想参加的</span>
        </div>
        <p className="mb-4 text-[12.5px] leading-relaxed text-muted">
          徒步、骑行、球类、露营……每一类都有自己的节奏和强度，先挑对类型，再挑人。
        </p>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {/* 全部 */}
          <button
            onClick={() => setCat('ALL')}
            className={`group flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all ${
              cat === 'ALL'
                ? 'border-moss-500 bg-moss-50/70 ring-2 ring-moss-500/20'
                : 'border-stone-200 bg-white hover:border-moss-300 hover:shadow-[0_4px_16px_-10px_rgba(31,52,29,0.3)]'
            }`}
          >
            <span className="text-[19px]">🗂️</span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium">全部</span>
              <span className="block text-[11px] text-muted tabular">{list?.length ?? 0} 场</span>
            </span>
          </button>

          {CATEGORIES.map((c) => {
            const n = counts[c.key] ?? 0;
            const active = cat === c.key;
            const dim = n === 0;
            return (
              <button
                key={c.key}
                onClick={() => setCat(active ? 'ALL' : c.key)}
                className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all ${
                  active
                    ? 'border-moss-500 bg-moss-50/70 ring-2 ring-moss-500/20'
                    : dim
                      ? 'border-stone-100 bg-stone-50/50 opacity-60 hover:opacity-100'
                      : 'border-stone-200 bg-white hover:border-moss-300 hover:shadow-[0_4px_16px_-10px_rgba(31,52,29,0.3)]'
                }`}
              >
                <span className="text-[19px]">{c.emoji}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">{c.label}</span>
                  <span className="block text-[11px] text-muted tabular">
                    {n > 0 ? `${n} 场` : '暂无'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* 快捷筛选 */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-muted">快捷筛选</span>
          <button
            onClick={() => setOnlySeats((v) => !v)}
            className={`rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
              onlySeats
                ? 'border-moss-500 bg-moss-500 text-white'
                : 'border-stone-200 bg-white text-stone-600 hover:border-moss-300'
            }`}
          >
            还有名额
          </button>
          <button
            onClick={() => setOnlyGuarantee((v) => !v)}
            className={`rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
              onlyGuarantee
                ? 'border-moss-500 bg-moss-500 text-white'
                : 'border-stone-200 bg-white text-stone-600 hover:border-moss-300'
            }`}
          >
            收保证金
          </button>
          {(cat !== 'ALL' || onlySeats || onlyGuarantee) && (
            <button
              onClick={() => {
                setCat('ALL');
                setOnlySeats(false);
                setOnlyGuarantee(false);
              }}
              className="text-[12px] text-muted underline-offset-2 hover:text-ink hover:underline"
            >
              重置筛选
            </button>
          )}
          <span className="ml-auto text-[12px] text-muted tabular">
            共 {filtered.length} 场符合
          </span>
        </div>

        <div className="card mt-6 bg-moss-50/40 p-4">
          <p className="text-[12px] leading-relaxed text-muted">
            <span className="font-medium text-ink">为什么要分类？</span>
            不同强度的活动对人的要求差别很大。徒步看体能、骑行看装备、球类看水平、
            露营看耐心——先按类型圈定范围，再按保证金和信用分判断匹配度，
            组局成功率会高很多。
          </p>
        </div>
      </section>
    </div>
  );
}
