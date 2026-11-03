'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, apiPost, fmtMoney, fmtTime, STATUS_LABEL } from '@/lib/client';
import { Badge, EmptyState, Spinner, Toast } from '@/components/ui';

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

export default function MinePage() {
  const [rows, setRows] = useState<Mine[] | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: 'moss' | 'red' | 'amber' } | null>(null);
  const [appealFor, setAppealFor] = useState<Mine | null>(null);
  const [statement, setStatement] = useState('');

  const load = useCallback(() => {
    api<Mine[]>('/api/me/registrations').then(setRows).catch(() => setRows([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function cancel(r: Mine) {
    try {
      const res = await apiPost<{ lateCancel: boolean; refundTriggered: boolean }>(
        `/api/registrations/${r.id}/cancel`,
        { reason: '用户取消' }
      );
      setToast({
        msg: res.lateCancel
          ? `已取消。保证金全额退回，信用扣 2 分（T0−12 小时内取消）`
          : `已取消。保证金全额退回，信用不受影响`,
        tone: res.lateCancel ? 'amber' : 'moss',
      });
      load();
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
      load();
    } catch (e) {
      setToast({ msg: (e as Error).message, tone: 'red' });
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <h1 className="text-[22px] font-semibold tracking-tight">我的报名</h1>
      <p className="mt-1.5 text-[13px] text-muted">
        保证金状态与核销结果都会在这里体现。爽约后 24 小时内可申诉。
      </p>

      {!rows && (
        <div className="py-12">
          <Spinner />
        </div>
      )}

      {rows && rows.length === 0 && (
        <EmptyState title="还没有报名记录" hint="去发现页看看有什么局。" />
      )}

      <div className="mt-5 space-y-2.5">
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
                    资金：<span className={r.orderStatus === 'RELEASED' ? 'text-moss-600' : ''}>{os.text}</span>
                  </span>
                )}
                {r.checkinAt && <span>核销于 {fmtTime(r.checkinAt)}</span>}
              </div>

              {(canCancel || canAppeal) && (
                <div className="mt-3 flex gap-2 border-t border-stone-100 pt-3">
                  {canCancel && (
                    <button className="btn btn-danger !py-1.5 !text-[12px]" onClick={() => cancel(r)}>
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

      {/* 申诉弹窗 */}
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
