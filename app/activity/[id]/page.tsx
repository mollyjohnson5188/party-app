'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { api, apiPost, fmtMoney, fmtTime, relTime, STATUS_LABEL } from '@/lib/client';
import { Badge, CreditPill, Spinner, Toast } from '@/components/ui';

interface RegRow {
  id: string;
  nickname: string;
  status: string;
  checkinStatus: string;
  guaranteeAmount: number;
  checkinAt: string | null;
  creditScore: number | null;
  orderStatus: string | null;
  checkinCode: string | null;
}

interface Detail {
  id: string;
  title: string;
  description: string;
  location: string;
  startAt: string;
  endAt: string;
  capacity: number;
  status: string;
  guaranteeMode: 'NONE' | 'GUARANTEE';
  guaranteeAmount: number;
  minCreditScore: number;
  hostId: string;
  hostName: string;
  isHost: boolean;
  registrations?: RegRow[];
  registrationCount: number;
}

export default function ActivityPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-5 py-16">
          <Spinner label="加载活动" />
        </div>
      }
    >
      <ActivityContent />
    </Suspense>
  );
}

function ActivityContent() {
  const params = useParams<{ id: string }>();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: 'moss' | 'red' | 'amber' } | null>(null);
  const [paying, setPaying] = useState<{ orderId: string; regId: string; amount: number } | null>(
    null
  );
  const [myRegId, setMyRegId] = useState<string | null>(null);
  const [myStatus, setMyStatus] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Detail>(`/api/activities/${params.id}`)
      .then(setD)
      .catch((e) => setErr(e.message));
  }, [params.id]);

  useEffect(() => {
    load();
    api<{ id: string; activityId: string; status: string }[]>('/api/me/registrations')
      .then((rows) => {
        const mine = rows.find(
          (r) =>
            r.activityId === params.id &&
            ['PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'NO_SHOW'].includes(r.status)
        );
        setMyRegId(mine?.id ?? null);
        setMyStatus(mine?.status ?? null);
      })
      .catch(() => {});
  }, [load, params.id]);

  async function doRegister() {
    setBusy(true);
    try {
      const res = await apiPost<{
        registration: { id: string; status: string; checkinCode?: string };
        payment: { orderId: string; amount: number } | null;
      }>('/api/registrations', {
        activityId: params.id,
        guaranteeMode: d?.guaranteeMode,
      });

      if (res.payment) {
        // 保证金模式：进入支付模拟
        setPaying({
          orderId: res.payment.orderId,
          regId: res.registration.id,
          amount: res.payment.amount,
        });
      } else {
        setToast({ msg: `报名成功，核销码 ${res.registration.checkinCode}`, tone: 'moss' });
        load();
      }
    } catch (e) {
      const ee = e as Error & { code?: string };
      setToast({ msg: ee.message, tone: 'red' });
    } finally {
      setBusy(false);
    }
  }

  async function doPay() {
    if (!paying) return;
    setBusy(true);
    try {
      const ts = Date.now().toString();
      const raw = JSON.stringify({
        orderId: paying.orderId,
        registrationId: paying.regId,
        channelTxnId: `wx_${Date.now()}`,
        channelEventId: `evt_${Date.now()}`,
        amount: paying.amount,
        paidAt: new Date().toISOString(),
      });
      // 前端演示：调用一个代签接口完成回调
      await apiPost('/api/dev/sign-and-notify', { raw, timestamp: ts });
      setToast({ msg: '保证金已冻结，报名成功', tone: 'moss' });
      setPaying(null);
      load();
    } catch (e) {
      setToast({ msg: (e as Error).message, tone: 'red' });
    } finally {
      setBusy(false);
    }
  }

  async function doCancel() {
    if (!myRegId) return;
    setBusy(true);
    try {
      const res = await apiPost<{ lateCancel: boolean; refundTriggered: boolean }>(
        `/api/registrations/${myRegId}/cancel`,
        { reason: '临时有事' }
      );
      setToast({
        msg: res.lateCancel
          ? `已取消，迟到取消扣 2 分信用${res.refundTriggered ? '，保证金全额退回' : ''}`
          : `已取消${res.refundTriggered ? '，保证金全额退回' : ''}`,
        tone: res.lateCancel ? 'amber' : 'moss',
      });
      load();
    } catch (e) {
      setToast({ msg: (e as Error).message, tone: 'red' });
    } finally {
      setBusy(false);
    }
  }

  async function doCheckin(regId: string) {
    setBusy(true);
    try {
      const res = await apiPost<{ alreadyCheckedIn: boolean; message: string }>(
        '/api/host/checkin/manual',
        { registrationId: regId }
      );
      setToast({ msg: res.message, tone: res.alreadyCheckedIn ? 'amber' : 'moss' });
      load();
    } catch (e) {
      setToast({ msg: (e as Error).message, tone: 'red' });
    } finally {
      setBusy(false);
    }
  }

  if (err) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16">
        <div className="card p-6 text-sm text-red-600">{err}</div>
      </div>
    );
  }

  if (!d) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16">
        <Spinner label="加载活动" />
      </div>
    );
  }

  const joined = d.registrationCount;
  const canRegister = !d.isHost && d.status === 'PUBLISHED';

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <Link href="/" className="text-[12.5px] text-muted hover:text-ink">
        ← 返回组局列表
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight">{d.title}</h1>
          <p className="mt-2 text-[13px] text-muted">
            由 <span className="text-ink">{d.hostName}</span> 主理 · {relTime(d.startAt)}
          </p>
        </div>
        {d.status === 'CANCELLED' && <Badge text="活动已取消" tone="red" />}
      </div>

      <div className="card mt-6 divide-y divide-stone-100">
        <Row icon="loc" label="地点" value={d.location} />
        <Row icon="time" label="集合时间" value={`${fmtTime(d.startAt)}（T0）`} />
        <Row icon="time" label="结束时间" value={fmtTime(d.endAt)} />
        <Row icon="user" label="已报名" value={`${joined} / ${d.capacity} 人`} />
        <Row
          icon="lock"
          label="保证金"
          value={
            d.guaranteeMode === 'GUARANTEE'
              ? `${fmtMoney(d.guaranteeAmount)} · 到场核销全额原路退`
              : '免费占位，不涉及资金'
          }
        />
        {d.minCreditScore > 0 && (
          <Row icon="shield" label="信用门槛" value={`不低于 ${d.minCreditScore} 分`} />
        )}
      </div>

      {d.description && (
        <div className="card mt-3 p-5">
          <h3 className="mb-2 text-[13px] font-medium text-muted">活动说明</h3>
          <p className="text-[13.5px] leading-relaxed">{d.description}</p>
        </div>
      )}

      {/* 操作区 */}
      <div className="card mt-3 p-5">
        {d.isHost ? (
          <HostPanel
            d={d}
            busy={busy}
            onCheckin={doCheckin}
            onCancelActivity={async () => {
              setBusy(true);
              try {
                const r = await apiPost<{ affectedRegistrations: number; refundsTriggered: number }>(
                  `/api/activities/${d.id}/cancel`,
                  { reason: '主理人取消' }
                );
                setToast({
                  msg: `活动已取消，${r.affectedRegistrations} 人受影响，${r.refundsTriggered} 笔保证金已全额退回`,
                  tone: 'amber',
                });
                load();
              } catch (e) {
                setToast({ msg: (e as Error).message, tone: 'red' });
              } finally {
                setBusy(false);
              }
            }}
          />
        ) : (
          <div>
            {paying ? (
              <div>
                <p className="text-[13px] font-medium">确认支付保证金 {fmtMoney(paying.amount)}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">
                  这笔钱会在支付通道冻结。到场核销后 24 小时内原路全额退回；
                  若爽约，将作为补偿分给按时到场的参与者，平台不留存。
                </p>
                <div className="mt-4 flex gap-2">
                  <button className="btn btn-primary" disabled={busy} onClick={doPay}>
                    确认冻结 {fmtMoney(paying.amount)}
                  </button>
                  <button
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() => {
                      setPaying(null);
                      load();
                    }}
                  >
                    稍后支付
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-[13px] leading-relaxed text-muted">
                  {d.guaranteeMode === 'GUARANTEE'
                    ? `报名需冻结 ${fmtMoney(d.guaranteeAmount)} 保证金。取消规则：T0−12 小时前取消全额退且不扣分；之后取消全额退但扣 2 分信用。`
                    : '免费占位。爽约将扣 10 分信用。'}
                </p>
                <div className="mt-4 flex items-center gap-2">
                  {myStatus && myStatus !== 'PENDING_PAYMENT' ? (
                    <>
                      <Badge
                        text={STATUS_LABEL[myStatus]?.text ?? myStatus}
                        tone={(STATUS_LABEL[myStatus]?.tone as 'moss') ?? 'gray'}
                      />
                      {myRegId && ['CONFIRMED'].includes(myStatus) && (
                        <button className="btn btn-danger" disabled={busy} onClick={doCancel}>
                          取消报名
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      className="btn btn-primary"
                      disabled={busy || !canRegister}
                      onClick={doRegister}
                    >
                      {busy
                        ? '处理中…'
                        : d.guaranteeMode === 'GUARANTEE'
                          ? '报名并冻结保证金'
                          : '免费报名'}
                    </button>
                  )}
                  {!canRegister && !myStatus && d.status !== 'PUBLISHED' && (
                    <span className="text-[12px] text-muted">该活动当前不可报名</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 主理人名单 */}
      {d.isHost && d.registrations && d.registrations.length > 0 && (
        <div className="card mt-3 overflow-hidden">
          <div className="border-b border-stone-100 px-5 py-3">
            <h3 className="text-[13px] font-medium">报名名单</h3>
          </div>
          <div className="divide-y divide-stone-100">
            {d.registrations.map((r) => {
              const st = STATUS_LABEL[r.status] ?? { text: r.status, tone: 'gray' };
              const cs = STATUS_LABEL[r.checkinStatus];
              return (
                <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-100 text-[11px] font-medium text-stone-600">
                    {r.nickname.slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{r.nickname}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                      {r.creditScore !== null && <span>信用 {r.creditScore}</span>}
                      {r.checkinCode && <span>码 {r.checkinCode}</span>}
                      {r.orderStatus && (
                        <span>{STATUS_LABEL[r.orderStatus]?.text ?? r.orderStatus}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.checkinStatus === 'CHECKED_IN' ? (
                      <Badge text={cs?.text ?? '已到场'} tone="moss" />
                    ) : r.status === 'CONFIRMED' || r.status === 'NO_SHOW' ? (
                      <button className="btn btn-ghost !px-3 !py-1.5 !text-[12px]" disabled={busy} onClick={() => doCheckin(r.id)}>
                        核销
                      </button>
                    ) : (
                      <Badge text={st.text} tone={st.tone as 'gray'} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {toast && <Toast message={toast.msg} tone={toast.tone} onClose={() => setToast(null)} />}
    </div>
  );
}

function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  const paths: Record<string, React.ReactNode> = {
    loc: (
      <>
        <path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" strokeLinejoin="round" />
        <circle cx="12" cy="10" r="2.4" />
      </>
    ),
    time: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5V12l3 2" strokeLinecap="round" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="3.4" />
        <path d="M5 20c0-3.5 3.1-5.6 7-5.6s7 2.1 7 5.6" strokeLinecap="round" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
        <path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" strokeLinecap="round" />
      </>
    ),
    shield: <path d="M12 3l7 3v5.5c0 4.2-2.9 7.6-7 9.5-4.1-1.9-7-5.3-7-9.5V6l7-3z" strokeLinejoin="round" />,
  };
  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8a9086" strokeWidth="1.7">
        {paths[icon]}
      </svg>
      <span className="w-20 shrink-0 text-[12.5px] text-muted">{label}</span>
      <span className="text-[13px]">{value}</span>
    </div>
  );
}

function HostPanel({
  d,
  busy,
  onCheckin,
  onCancelActivity,
}: {
  d: Detail;
  busy: boolean;
  onCheckin: (id: string) => void;
  onCancelActivity: () => void;
}) {
  void onCheckin;
  const checked = d.registrations?.filter((r) => r.checkinStatus === 'CHECKED_IN').length ?? 0;
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-medium">主理人视角</p>
          <p className="mt-1 text-[12px] text-muted">
            已到场 {checked} 人 · 核销窗口 T0−60 分钟 至 T0+120 分钟
          </p>
        </div>
        {d.status !== 'CANCELLED' && (
          <button className="btn btn-danger" disabled={busy} onClick={onCancelActivity}>
            取消活动并全额退款
          </button>
        )}
      </div>
      <p className="mt-3 rounded-lg bg-stone-50 px-3 py-2 text-[11.5px] leading-relaxed text-muted">
        取消活动会为所有已冻结保证金全额原路退款，且不扣任何参与者信用分。
        活动延期不支持直接改时间，需取消后重新发布。
      </p>
    </div>
  );
}
