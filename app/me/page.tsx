'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { api, apiPost, fmtMoney, fmtTime, relTime, STATUS_LABEL } from '@/lib/client';
import { Badge, EmptyState, Spinner, Toast } from '@/components/ui';

/* ============ 类型 ============ */
interface Mine {
  id: string;
  activityId: string;
  title: string;
  location: string;
  startAt: string;
  endAt: string;
  status: string;
  checkinStatus: string;
  guaranteeAmount: number;
  orderStatus: string | null;
  checkinAt: string | null;
}

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

interface MyPost {
  id: string;
  title: string;
  excerpt: string;
  likeCount: number;
  replyCount: number;
  createdAt: string;
  board: { name: string; emoji: string };
}

const LEVEL_LABEL: Record<string, string> = {
  EXCELLENT: '优秀',
  NORMAL: '正常',
  RISK: '风险',
};

const EVENT_LABEL: Record<string, string> = {
  INIT: '初始信用',
  CHECK_IN: '成行到场',
  NO_SHOW: '爽约',
  LATE_CANCEL: '临时取消',
  APPEAL_REVERT: '申诉撤销',
};

type Tab = 'records' | 'credit' | 'posts';

/* ============ 页面 ============ */
export default function MePage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-5 py-16"><Spinner label="加载个人中心" /></div>}>
      <MeContent />
    </Suspense>
  );
}

function MeContent() {
  const sp = useSearchParams();
  const initialTab = (sp.get('tab') as Tab) || 'records';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [rows, setRows] = useState<Mine[] | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [ledger, setLedger] = useState<Ledger[] | null>(null);
  const [posts, setPosts] = useState<MyPost[] | null>(null);

  const [toast, setToast] = useState<{ msg: string; tone: 'moss' | 'red' | 'amber' } | null>(null);
  const [appealFor, setAppealFor] = useState<Mine | null>(null);
  const [statement, setStatement] = useState('');

  const loadRecords = useCallback(() => {
    api<Mine[]>('/api/me/registrations').then(setRows).catch(() => setRows([]));
  }, []);

  useEffect(() => {
    loadRecords();
    api<Me>('/api/credit/me').then(setMe).catch(() => {});
  }, [loadRecords]);

  // 标签切换时按需加载
  useEffect(() => {
    if (tab === 'credit' && !ledger) {
      api<Ledger[]>('/api/credit/ledger?limit=50').then(setLedger).catch(() => setLedger([]));
    }
    if (tab === 'posts' && !posts) {
      api<MyPost[]>('/api/circle/posts?mine=1').then(setPosts).catch(() => setPosts([]));
    }
  }, [tab, ledger, posts]);

  async function cancel(r: Mine) {
    try {
      const res = await apiPost<{ lateCancel: boolean; refundTriggered: boolean }>(
        `/api/registrations/${r.id}/cancel`,
        { reason: '用户取消' }
      );
      setToast({
        msg: res.lateCancel
          ? '已取消。保证金全额退回，信用扣 2 分（T0−12 小时内取消）'
          : '已取消。保证金全额退回，信用不受影响',
        tone: res.lateCancel ? 'amber' : 'moss',
      });
      loadRecords();
      setLedger(null);
      api<Me>('/api/credit/me').then(setMe).catch(() => {});
    } catch (e) {
      setToast({ msg: (e as Error).message, tone: 'red' });
    }
  }

  async function submitAppeal() {
    if (!appealFor) return;
    try {
      await apiPost('/api/appeals', {
        registrationId: appealFor.id,
        statement: statement || '我确实到场了，请核查',
        evidenceUrls: [],
      });
      setToast({ msg: '申诉已提交，管理员会在 1 个工作日内审核', tone: 'moss' });
      setAppealFor(null);
      setStatement('');
      loadRecords();
    } catch (e) {
      setToast({ msg: (e as Error).message, tone: 'red' });
    }
  }

  const pct = me ? Math.min(100, Math.round((me.score / 120) * 100)) : 0;
  const myUserId =
    typeof window !== 'undefined' ? (localStorage.getItem('party.currentUser') ?? 'u_zhang') : 'u_zhang';

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      {/* ===== 个人档案件 ===== */}
      <div className="card overflow-hidden">
        <div
          className="flex items-center gap-4 px-5 py-5"
          style={{ background: 'linear-gradient(135deg,#F4F1EA 0%,#E7E1D3 100%)' }}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/70 text-[22px] font-semibold text-moss-700 shadow-sm">
            {me ? '' : ''}
            <span className="text-[20px]">🧑‍🌾</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-semibold tracking-tight">我的主页</p>
            <p className="mt-0.5 text-[12px] text-stone-600">
              会员 ID：<span className="tabular">{myUserId}</span> · 报名、信用、帖子都在这里
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-stone-600">信用分</p>
            <p className="text-[26px] font-semibold leading-none tabular text-moss-700">
              {me?.score ?? '—'}
            </p>
          </div>
        </div>

        {/* 三个关键指标 */}
        <div className="grid grid-cols-3 divide-x divide-stone-100 border-t border-stone-100">
          <MiniStat label="参与报名" value={rows?.length ?? 0} tone="ink" />
          <MiniStat label="成行到场" value={me?.checkinCount ?? 0} tone="moss" />
          <MiniStat label="爽约" value={me?.noShowCount ?? 0} tone="red" />
        </div>
      </div>

      {/* ===== 标签页 ===== */}
      <div className="mt-6 flex gap-1 border-b border-stone-200">
        {(
          [
            { k: 'records', label: '我的报名', count: rows?.length },
            { k: 'credit', label: '信用中心', count: null },
            { k: 'posts', label: '我的帖子', count: posts?.length },
          ] as { k: Tab; label: string; count: number | null | undefined }[]
        ).map((t) => {
          const active = tab === t.k;
          return (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`relative -mb-px border-b-2 px-4 py-2.5 text-[13.5px] transition-colors ${
                active
                  ? 'border-moss-600 font-medium text-moss-700'
                  : 'border-transparent text-stone-500 hover:text-ink'
              }`}
            >
              {t.label}
              {t.count != null && t.count > 0 && (
                <span className="ml-1.5 rounded-full bg-stone-100 px-1.5 py-0.5 text-[10.5px] tabular text-stone-500">
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ===== 我的报名 ===== */}
      {tab === 'records' && (
        <div className="mt-4">
          {!rows && <Spinner />}
          {rows && rows.length === 0 && (
            <EmptyState title="还没有报名记录" hint="去发现页看看有什么局。" />
          )}
          <div className="space-y-2.5">
            {rows?.map((r) => {
              const st = STATUS_LABEL[r.status] ?? { text: r.status, tone: 'gray' };
              const os = r.orderStatus ? STATUS_LABEL[r.orderStatus] : null;
              const canCancel = r.status === 'CONFIRMED' && new Date(r.startAt).getTime() > Date.now();
              const canAppeal = r.checkinStatus === 'NO_SHOW';
              return (
                <div key={r.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/activity/${r.activityId}`}
                      className="text-[14.5px] font-medium leading-snug hover:text-moss-700"
                    >
                      {r.title}
                    </Link>
                    <Badge text={st.text} tone={st.tone as 'moss'} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
                    <span>{fmtTime(r.startAt)}</span>
                    <span>{r.location}</span>
                    {r.guaranteeAmount > 0 && (
                      <span className="tabular">保证金 {fmtMoney(r.guaranteeAmount)}</span>
                    )}
                    {os && (
                      <span className="text-[11.5px]">
                        资金：
                        <span className={r.orderStatus === 'RELEASED' ? 'text-moss-600' : ''}>
                          {os.text}
                        </span>
                      </span>
                    )}
                    {r.checkinAt && <span>核销于 {fmtTime(r.checkinAt)}</span>}
                  </div>
                  {(canCancel || canAppeal) && (
                    <div className="mt-3 flex gap-2 border-t border-stone-100 pt-3">
                      {canCancel && (
                        <button
                          className="btn btn-danger !py-1.5 !text-[12px]"
                          onClick={() => cancel(r)}
                        >
                          取消报名
                        </button>
                      )}
                      {canAppeal && (
                        <button
                          className="btn btn-ghost !py-1.5 !text-[12px]"
                          onClick={() => setAppealFor(r)}
                        >
                          申诉爽约判定
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== 信用中心 ===== */}
      {tab === 'credit' && (
        <div className="mt-4">
          {!me && (
            <div className="py-12">
              <Spinner />
            </div>
          )}
          {me && (
            <>
              <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
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
                  <MiniStat label="成行" value={me.checkinCount} tone="moss" block />
                  <MiniStat label="爽约" value={me.noShowCount} tone="red" block />
                  <MiniStat label="临时取消" value={me.lateCancelCount} tone="amber" block />
                </div>
              </div>

              <div className="card mt-3 p-4">
                <p className="text-[12px] leading-relaxed text-muted">
                  <span className="font-medium text-ink">规则速览</span>：成行 +1（活动结束后统一结算）·
                  爽约 −10（T0+120 分钟自动判定）· T0−12 小时内取消 −2 ·
                  提前 12 小时以上取消不扣分 · 活动取消不影响任何参与者信用 ·
                  申诉通过加回被扣分数（每单仅一次）。
                </p>
              </div>

              <h2 className="mt-6 mb-3 text-[15px] font-semibold">变动记录</h2>
              {!ledger && <Spinner />}
              {ledger && ledger.length === 0 && (
                <div className="card p-6 text-center text-[13px] text-muted">暂无记录</div>
              )}
              <div className="card divide-y divide-stone-100 overflow-hidden">
                {ledger?.map((r) => (
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
            </>
          )}
        </div>
      )}

      {/* ===== 我的帖子 ===== */}
      {tab === 'posts' && (
        <div className="mt-4">
          {!posts && <Spinner />}
          {posts && posts.length === 0 && (
            <div className="card p-10 text-center">
              <p className="text-[14px] text-muted">还没发过帖子</p>
              <Link href="/circle" className="btn btn-primary mt-3 inline-block">
                去圈子看看
              </Link>
            </div>
          )}
          <div className="space-y-2.5">
            {posts?.map((p) => (
              <Link
                key={p.id}
                href={`/circle/${p.id}`}
                className="card block p-4 transition-colors hover:border-moss-300"
              >
                <div className="flex items-start gap-2">
                  <span>{p.board.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium leading-snug">{p.title}</p>
                    <p className="mt-1 line-clamp-1 text-[12px] text-muted">{p.excerpt}</p>
                    <p className="mt-1.5 flex items-center gap-3 text-[11.5px] text-muted">
                      <span>{p.board.name}</span>
                      <span>{relTime(p.createdAt)}</span>
                      <span className="ml-auto">♥ {p.likeCount} · 💬 {p.replyCount}</span>
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ===== 申诉弹窗 ===== */}
      {appealFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-5">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-[15px] font-semibold">申诉爽约判定</h3>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
              针对「{appealFor.title}」。请说明当日情况。审核通过后保证金会全额退回，
              被扣的信用分会加回。同一报名单只能申诉一次。
            </p>
            <textarea
              className="input mt-3 h-24 resize-none"
              placeholder="例如：我 10:05 到场并找主理人核销，但主理人当时在忙没扫码…"
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn btn-ghost" onClick={() => setAppealFor(null)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={submitAppeal}>
                提交申诉
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.msg} tone={toast.tone} onClose={() => setToast(null)} />}
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
  block,
}: {
  label: string;
  value: number;
  tone: string;
  block?: boolean;
}) {
  const color =
    tone === 'moss'
      ? 'text-moss-600'
      : tone === 'red'
        ? 'text-red-600'
        : tone === 'amber'
          ? 'text-amber-600'
          : 'text-ink';
  return (
    <div className={`px-4 py-3 ${block ? 'sm:flex sm:items-center sm:justify-between' : 'text-center'}`}>
      <span className="block text-[11.5px] text-muted sm:inline">{label}</span>
      <span className={`block text-[17px] font-semibold tabular ${color} sm:inline`}>{value}</span>
    </div>
  );
}
