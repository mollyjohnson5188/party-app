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
  description?: string | null;
}

const SORTS = [
  { key: 'START_ASC', label: '最近开场', hint: '按开始时间由近到远' },
  { key: 'START_DESC', label: '最晚开场', hint: '按开始时间由远到近' },
  { key: 'JOINED_DESC', label: '报名最多', hint: '按已报名人数由多到少' },
  { key: 'JOINED_ASC', label: '报名最少', hint: '按已报名人数由少到多' },
  { key: 'DEPOSIT_DESC', label: '保证金高', hint: '按保证金金额由高到低' },
  { key: 'DEPOSIT_ASC', label: '保证金低', hint: '按保证金金额由低到高' },
  { key: 'CREDIT_DESC', label: '信用门槛', hint: '按信用分门槛由高到低' },
  { key: 'REMAIN_ASC', label: '名额最紧', hint: '按剩余名额由少到多' },
];

export default function HomePage() {
  const [list, setList] = useState<ActivityItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cat, setCat] = useState<string>('ALL');
  const [onlySeats, setOnlySeats] = useState(false);
  const [onlyGuarantee, setOnlyGuarantee] = useState(false);
  const [sort, setSort] = useState<string>('START_ASC');
  const [sortOpen, setSortOpen] = useState(false);

  useEffect(() => {
    api<ActivityItem[]>('/api/activities')
      .then(setList)
      .catch((e) => setErr(e.message));
  }, []);

  const counts: Record<string, number> = {};
  for (const a of list ?? []) {
    const k = a.category ?? 'OTHER';
    counts[k] = (counts[k] ?? 0) + 1;
  }

  const filtered = (list ?? [])
    .filter((a) => {
      if (cat !== 'ALL' && (a.category ?? 'OTHER') !== cat) return false;
      if (onlySeats && a.joined >= a.capacity) return false;
      if (onlyGuarantee && a.guaranteeMode !== 'GUARANTEE') return false;
      return true;
    })
    .sort((a, b) => {
      const t = (x: ActivityItem) => new Date(x.startAt).getTime();
      switch (sort) {
        case 'START_DESC':
          return t(b) - t(a);
        case 'JOINED_DESC':
          return b.joined - a.joined || t(a) - t(b);
        case 'JOINED_ASC':
          return a.joined - b.joined || t(a) - t(b);
        case 'DEPOSIT_DESC':
          return b.guaranteeAmount - a.guaranteeAmount || t(a) - t(b);
        case 'DEPOSIT_ASC':
          return a.guaranteeAmount - b.guaranteeAmount || t(a) - t(b);
        case 'CREDIT_DESC':
          return b.minCreditScore - a.minCreditScore || t(a) - t(b);
        case 'REMAIN_ASC':
          return a.capacity - a.joined - (b.capacity - b.joined) || t(a) - t(b);
        default:
          return t(a) - t(b);
      }
    });

  const activeSort = SORTS.find((o) => o.key === sort)!;

  return (
    <div className="mx-auto max-w-6xl sm:px-5">
      {/* ================= 移动端：Reddit 式顶栏 ================= */}
      <div className="sticky top-14 z-30 border-b border-stone-200/80 bg-[#f7f6f2]/95 backdrop-blur-md sm:hidden">
        {/* 搜索框 + 排序 */}
        <div className="flex items-center gap-2 px-3 py-2">
          <Link
            href="/?search=1"
            className="flex h-9 flex-1 items-center gap-2 rounded-full border border-stone-200 bg-white px-3.5 text-[13px] text-stone-400"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
            搜索组局、路线、人
          </Link>
          <button
            onClick={() => setSortOpen(true)}
            className="flex h-9 shrink-0 items-center gap-1 rounded-full border border-stone-200 bg-white px-3 text-[12.5px] text-stone-600"
          >
            {activeSort.label}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M6 9l6 6 6-6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* 分类横向滚动（Reddit 社区 pill 条） */}
        <div className="scrollbar-none flex gap-1.5 overflow-x-auto px-3 pb-2">
          <CatPill active={cat === 'ALL'} onClick={() => setCat('ALL')}>
            🗂️ 全部
          </CatPill>
          {CATEGORIES.map((c) => {
            const n = counts[c.key] ?? 0;
            return (
              <CatPill
                key={c.key}
                active={cat === c.key}
                dim={n === 0}
                onClick={() => setCat(cat === c.key ? 'ALL' : c.key)}
              >
                {c.emoji} {c.label}
                {n > 0 && <span className="ml-1 opacity-55">{n}</span>}
              </CatPill>
            );
          })}
          <span className="shrink-0 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[12px] text-stone-500" />
        </div>
      </div>

      {/* ================= 桌面端 Hero（移动端极简） ================= */}
      <section className="px-5 pb-6 pt-6 sm:pt-12 sm:pb-10">
        <p className="hidden text-[12px] font-medium uppercase tracking-[0.18em] text-moss-600 sm:mb-3 sm:block">
          OUTDOOR · AFTER WORK
        </p>
        <h1 className="max-w-2xl text-[23px] font-semibold leading-[1.25] tracking-tight text-ink sm:text-[40px] sm:leading-[1.2]">
          下班之后的
          <span className="hidden sm:inline"><br /></span>
          <span className="sm:hidden"> </span>
          第二生活现场
        </h1>
        <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted sm:mt-4 sm:text-[14px]">
          保证金只是承诺，不是收入。到场核销，钱原路全额退回；
          <span className="hidden sm:inline">真的没来，</span>
          <span className="sm:hidden">没来则</span>
          分给按时到场的人。
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-muted sm:mt-6 sm:gap-x-6 sm:text-[12px]">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-moss-500" />
            到场即全额退
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-clay-400" />
            平台零截留
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-stone-400" />
            T0+120 判爽约
          </span>
        </div>
      </section>

      {/* ================= 特色横滑（Reddit 的 highlights） ================= */}
      {list && list.length > 0 && cat === 'ALL' && (
        <section className="mb-2 sm:hidden">
          <div className="flex items-baseline justify-between px-5 pb-2">
            <h2 className="text-[13px] font-semibold text-ink">即将开场</h2>
            <Link href="/blog" className="text-[11.5px] text-moss-700">
              攻略 →
            </Link>
          </div>
          <div className="scrollbar-none flex gap-2.5 overflow-x-auto px-5 pb-3">
            {filtered.slice(0, 6).map((a) => {
              const th = getTheme(a.theme);
              const remain = a.capacity - a.joined;
              return (
                <Link
                  key={a.id}
                  href={`/activity/${a.id}`}
                  className="relative flex h-[124px] w-[168px] shrink-0 flex-col justify-end overflow-hidden rounded-2xl p-3"
                  style={{ background: th.gradient }}
                >
                  <span className="absolute right-2.5 top-2.5 text-[20px]" style={{ filter: th.dark ? 'brightness(0) invert(1)' : 'none' }}>
                    {th.emoji}
                  </span>
                  <p
                    className="line-clamp-2 text-[13px] font-semibold leading-snug"
                    style={{ color: th.dark ? '#fff' : '#1F2A1B' }}
                  >
                    {a.title}
                  </p>
                  <p className="mt-1 text-[11px]" style={{ color: th.dark ? 'rgba(255,255,255,.75)' : th.accent }}>
                    {fmtTime(a.startAt)} · {remain > 0 ? `剩 ${remain}` : '已满'}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* 快捷筛选（移动端） */}
      <div className="scrollbar-none mb-1 flex gap-1.5 overflow-x-auto px-5 pb-1 sm:hidden">
        <FilterChip active={onlySeats} onClick={() => setOnlySeats((v) => !v)}>
          还有名额
        </FilterChip>
        <FilterChip active={onlyGuarantee} onClick={() => setOnlyGuarantee((v) => !v)}>
          收保证金
        </FilterChip>
        {(cat !== 'ALL' || onlySeats || onlyGuarantee) && (
          <button
            onClick={() => {
              setCat('ALL');
              setOnlySeats(false);
              setOnlyGuarantee(false);
            }}
            className="shrink-0 rounded-full px-2.5 py-1.5 text-[12px] text-moss-700 underline underline-offset-2"
          >
            重置
          </button>
        )}
      </div>

      {/* ================= 列表 ================= */}
      <section className="pb-4 sm:pb-12">
        <div className="mb-3 hidden flex-wrap items-center justify-between gap-3 sm:flex">
          <div className="flex items-baseline gap-3">
            <h2 className="text-[17px] font-semibold tracking-tight">近期组局</h2>
            <span className="text-[12px] text-muted">
              {list ? `${filtered.length} 个活动${cat !== 'ALL' || onlySeats || onlyGuarantee ? '（已筛选）' : ''}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-muted">排序</span>
            <div className="relative">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="appearance-none rounded-lg border border-stone-200 bg-white py-1.5 pl-3 pr-8 text-[12.5px] text-ink outline-none transition-colors hover:border-moss-300 focus:border-moss-500"
              >
                {SORTS.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-stone-400"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5 px-5 sm:px-0">
          <span className="hidden text-[11px] text-stone-400 sm:inline">快捷：</span>
          {SORTS.slice(0, 4).map((o) => (
            <button
              key={o.key}
              onClick={() => setSort(o.key)}
              className={`hidden rounded-full border px-2.5 py-1 text-[11.5px] transition-colors sm:inline ${
                sort === o.key
                  ? 'border-moss-500 bg-moss-50 text-moss-700'
                  : 'border-stone-200 bg-white text-stone-500 hover:border-moss-300'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {err && (
          <div className="mx-5 card p-5 text-sm text-red-600 sm:mx-0">
            {err}
            <p className="mt-2 text-xs leading-relaxed text-muted">
              若为数据库未初始化，请先执行迁移，再调用 POST /api/dev/seed 灌演示数据。
            </p>
          </div>
        )}

        {!list && !err && (
          <div className="py-10"><Spinner label="正在加载组局" /></div>
        )}

        {list && filtered.length === 0 && list.length > 0 && (
          <div className="mx-5 card p-8 text-center sm:mx-0">
            <p className="text-[14px] text-muted">这个分类下暂时没有组局</p>
            <button
              className="btn btn-ghost mt-3 !text-[12.5px]"
              onClick={() => { setCat('ALL'); setOnlySeats(false); setOnlyGuarantee(false); }}
            >
              查看全部组局
            </button>
          </div>
        )}

        {list && list.length === 0 && (
          <EmptyState title="还没有组局" hint="切换到主理人身份，去「主理人台」发起第一个活动。" />
        )}

        {/* 移动端：Reddit 式信息流单列；桌面：两列卡片 */}
        <div className="divide-y divide-stone-200/70 border-y border-stone-200/70 sm:grid sm:divide-y-0 sm:gap-3 sm:border-0">
          {filtered.map((a) => {
            const remain = a.capacity - a.joined;
            const pct = Math.min(100, Math.round((a.joined / a.capacity) * 100));
            const st = a.myStatus ? STATUS_LABEL[a.myStatus] : null;
            const th = getTheme(a.theme);
            const c = getCategory(a.category);
            return (
              <Link key={a.id} href={`/activity/${a.id}`} className="block sm:contents">
                {/* ---------- 移动端行 ---------- */}
                <article className="flex gap-3 bg-[#f7f6f2] px-4 py-3.5 active:bg-stone-100 sm:hidden">
                  <div className="flex flex-1 flex-col">
                    <div className="flex items-center gap-1.5 text-[11px] text-stone-400">
                      <span className="rounded-full bg-stone-200/60 px-1.5 py-0.5 font-medium text-stone-600">
                        {c.emoji} {c.label}
                      </span>
                      <span>·</span>
                      <span>{relTime(a.startAt)}</span>
                      {st && (
                        <span className="ml-auto rounded bg-moss-50 px-1.5 py-0.5 text-[10px] text-moss-700">
                          {st.text}
                        </span>
                      )}
                    </div>

                    <h3 className="mt-1.5 text-[15px] font-semibold leading-snug tracking-tight text-ink">
                      {a.title}
                    </h3>

                    <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-stone-500">
                      {a.description?.trim() || `${a.location} · ${fmtTime(a.startAt)} 集合 · ${a.hostName} 发起`}
                    </p>

                    <div className="mt-2 flex items-center gap-3 text-[11.5px] text-stone-400">
                      <span className="flex items-center gap-1">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                          <path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" strokeLinejoin="round" />
                        </svg>
                        {a.location}
                      </span>
                      <span className="flex items-center gap-1">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                          <path d="M17 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M10 11a4 4 0 100-8 4 4 0 000 8z" strokeLinecap="round" />
                        </svg>
                        {a.joined}/{a.capacity}
                        {remain > 0 && remain <= 2 && (
                          <span className="text-amber-600">剩 {remain}</span>
                        )}
                      </span>
                      {a.guaranteeMode === 'GUARANTEE' ? (
                        <span className="font-medium text-moss-700">保 {fmtMoney(a.guaranteeAmount)}</span>
                      ) : (
                        <span>免费</span>
                      )}
                    </div>
                  </div>

                  {/* 右侧缩略图（Reddit 的 thumbnail） */}
                  <div
                    className="relative flex h-[70px] w-[70px] shrink-0 items-center justify-center overflow-hidden rounded-xl"
                    style={{ background: th.gradient }}
                  >
                    <span className="text-[26px]" style={{ filter: th.dark ? 'brightness(0) invert(1)' : 'none' }}>
                      {th.emoji}
                    </span>
                    {a.joined >= a.capacity && (
                      <span className="absolute inset-x-0 bottom-0 bg-ink/70 py-0.5 text-center text-[9.5px] text-white">
                        已满
                      </span>
                    )}
                  </div>
                </article>

                {/* ---------- 桌面端卡片 ---------- */}
                <div className="card group hidden flex-col overflow-hidden p-0 transition-all hover:-translate-y-0.5 hover:border-moss-300 hover:shadow-[0_6px_24px_-12px_rgba(31,52,29,0.25)] sm:flex">
                  <div className="flex h-[76px] items-end justify-between px-5 pb-2" style={{ background: th.gradient }}>
                    <span className="text-[22px]" style={{ filter: th.dark ? 'brightness(0) invert(1)' : 'none' }}>{th.emoji}</span>
                    <span className="rounded-full bg-white/45 px-2 py-0.5 text-[10.5px] font-medium backdrop-blur-sm"
                      style={{ color: th.dark ? '#fff' : th.accent }}>
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
                          {remain > 0 && remain <= 2 && <span className="ml-1.5 text-amber-600">仅剩 {remain} 位</span>}
                        </span>
                        <span className="flex items-center gap-2">
                          {a.minCreditScore > 0 && (
                            <span className="text-[11px] text-stone-400">信用 ≥{a.minCreditScore}</span>
                          )}
                          <span className="font-medium tabular text-ink">
                            {a.guaranteeMode === 'GUARANTEE' ? `保证金 ${fmtMoney(a.guaranteeAmount)}` : '免费占位'}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ================= 桌面端分类区块（移动端已在上方 pill 条） ================= */}
      <section className="hidden border-t border-stone-200/70 pb-16 pt-8 sm:block">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-[17px] font-semibold tracking-tight">按类型找组局</h2>
          <span className="text-[12px] text-muted">选一类，只看你想参加的</span>
        </div>
        <p className="mb-4 text-[12.5px] leading-relaxed text-muted">
          徒步、骑行、球类、露营……每一类都有自己的节奏和强度，先挑对类型，再挑人。
        </p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          <button
            onClick={() => setCat('ALL')}
            className={`group flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all ${
              cat === 'ALL' ? 'border-moss-500 bg-moss-50/70 ring-2 ring-moss-500/20'
                : 'border-stone-200 bg-white hover:border-moss-300'}`}
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
              <button key={c.key} onClick={() => setCat(active ? 'ALL' : c.key)}
                className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all ${
                  active ? 'border-moss-500 bg-moss-50/70 ring-2 ring-moss-500/20'
                    : dim ? 'border-stone-100 bg-stone-50/50 opacity-60 hover:opacity-100'
                    : 'border-stone-200 bg-white hover:border-moss-300'}`}>
                <span className="text-[19px]">{c.emoji}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">{c.label}</span>
                  <span className="block text-[11px] text-muted tabular">{n > 0 ? `${n} 场` : '暂无'}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="card mt-6 bg-moss-50/40 p-4">
          <p className="text-[12px] leading-relaxed text-muted">
            <span className="font-medium text-ink">为什么要分类？</span>
            不同强度的活动对人的要求差别很大。徒步看体能、骑行看装备、球类看水平、露营看耐心——
            先按类型圈定范围，再按保证金和信用分判断匹配度，组局成功率会高很多。
          </p>
        </div>
      </section>

      {/* 移动端底部安全间距（避开 tab bar） */}
      <div className="h-4 sm:hidden" />

      {/* ================= 排序底部抽屉（移动端） ================= */}
      {sortOpen && (
        <div className="fixed inset-0 z-[60] sm:hidden" onClick={() => setSortOpen(false)}>
          <div className="absolute inset-0 bg-ink/40" />
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white pb-[max(env(safe-area-inset-bottom),12px)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-stone-300" />
            <p className="px-5 pb-1 pt-3 text-[13px] font-semibold">排序方式</p>
            <div className="max-h-[52vh] overflow-y-auto py-1">
              {SORTS.map((o) => (
                <button
                  key={o.key}
                  onClick={() => { setSort(o.key); setSortOpen(false); }}
                  className="flex w-full items-center justify-between px-5 py-3 text-left active:bg-stone-50"
                >
                  <span>
                    <span className={`block text-[14px] ${sort === o.key ? 'font-medium text-moss-700' : 'text-ink'}`}>
                      {o.label}
                    </span>
                    <span className="block text-[11.5px] text-stone-400">{o.hint}</span>
                  </span>
                  {sort === o.key && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3F7D3F" strokeWidth="2.6">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
            <button
              onClick={() => setSortOpen(false)}
              className="mx-4 mt-2 mb-3 w-[calc(100%-2rem)] rounded-xl bg-stone-100 py-3 text-[14px] font-medium text-stone-600"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CatPill({
  active, dim, onClick, children,
}: { active: boolean; dim?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12.5px] transition-colors ${
        active
          ? 'border-moss-600 bg-moss-600 text-white'
          : dim
            ? 'border-stone-200 bg-stone-50 text-stone-400'
            : 'border-stone-200 bg-white text-stone-600'
      }`}
    >
      {children}
    </button>
  );
}

function FilterChip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
        active ? 'border-moss-500 bg-moss-500 text-white' : 'border-stone-200 bg-white text-stone-600'
      }`}
    >
      {children}
    </button>
  );
}
