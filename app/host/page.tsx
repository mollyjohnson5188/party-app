'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, apiPost, fmtMoney, fmtTime, STATUS_LABEL } from '@/lib/client';
import { Badge, Spinner, Toast } from '@/components/ui';
import { THEMES, getTheme } from '@/lib/themes';

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
  theme?: string | null;
}

const JOBS = [
  { key: 'noShowCandidateJob', label: 'T0+60 爽约候选扫描', hint: '每 5 分钟' },
  { key: 'noShowFinalizeJob', label: 'T0+120 爽约判定与扣划', hint: '每 5 分钟' },
  { key: 'creditSettleJob', label: '成行加分结算', hint: '每日' },
  { key: 'paymentRetryJob', label: '退款/扣划重试', hint: '每 10 分钟' },
];

/** datetime-local 需要本地时区的 yyyy-MM-ddTHH:mm */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 8 个「兴趣点」芯片，一键追加到描述，解决"不知道怎么写才吸引人" */
const HOOKS = [
  '新手友好，零基础也能跟上',
  '专业领队全程带队',
  '人均预算可控，明码标价',
  '结束后可自由加场聚餐',
  '小团出行，最多 12 人',
  '市区集合，地铁直达',
  '全程拍照记录，出片率高',
  '装备可租借，不用自备',
];

interface FormState {
  title: string;
  location: string;
  startAt: string;
  durationMin: number;
  capacity: number;
  guaranteeOn: boolean;
  guaranteeAmount: number;
  minCreditScore: number;
  description: string;
  theme: string;
}

/** 默认值不含时间，避免预渲染期读取当前时间；时间在用户点开表单后填充 */
function emptyForm(): FormState {
  return {
    title: '',
    location: '',
    startAt: '',
    durationMin: 180,
    capacity: 12,
    guaranteeOn: true,
    guaranteeAmount: 50,
    minCreditScore: 80,
    description: '',
    theme: 'classic',
  };
}

export default function HostPage() {
  const [acts, setActs] = useState<Act[] | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: 'moss' | 'red' | 'amber' } | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState<Act | null>(null);
  /** 取消后暂存用于重发的内容 */
  const [resendDraft, setResendDraft] = useState<FormState | null>(null);

  const load = useCallback(() => {
    api<Act[]>('/api/activities').then(setActs).catch(() => setActs([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function publish() {
    if (!form.title.trim()) return setToast({ msg: '请填写活动标题', tone: 'red' });
    if (!form.location.trim()) return setToast({ msg: '请填写集合地点', tone: 'red' });
    if (!form.startAt) return setToast({ msg: '请选择开始时间', tone: 'red' });
    setSaving(true);
    try {
      const r = await apiPost<{ id: string }>('/api/activities', {
        title: form.title.trim(),
        location: form.location.trim(),
        startAt: new Date(form.startAt).toISOString(),
        durationMin: Number(form.durationMin) || 180,
        capacity: Number(form.capacity) || 12,
        guaranteeMode: form.guaranteeOn ? 'GUARANTEE' : 'NONE',
        guaranteeAmount: form.guaranteeOn ? Math.round(Number(form.guaranteeAmount) * 100) : 0,
        minCreditScore: Number(form.minCreditScore) || 0,
        description: form.description.trim() || undefined,
        theme: form.theme,
      });
      setToast({ msg: '发布成功，已上架组局列表', tone: 'moss' });
      setOpen(false);
      setForm(emptyForm());
      setResendDraft(null);
      load();
      return r;
    } catch (e) {
      setToast({ msg: (e as Error).message, tone: 'red' });
    } finally {
      setSaving(false);
    }
  }

  async function doCancel(a: Act) {
    setSaving(true);
    try {
      await apiPost(`/api/activities/${a.id}/cancel`, { reason: '主理人取消' });
      setToast({ msg: '已取消，所有保证金将全额原路退回', tone: 'moss' });
      setConfirmCancel(null);
      load();
    } catch (e) {
      setToast({ msg: (e as Error).message, tone: 'red' });
    } finally {
      setSaving(false);
    }
  }

  /** 取消并重发：把原活动内容带入表单，取消后立即可改时间重发 */
  async function cancelAndResend(a: Act) {
    setSaving(true);
    try {
      await apiPost(`/api/activities/${a.id}/cancel`, { reason: '主理人取消并重发' });
      const start = new Date(a.startAt);
      start.setDate(start.getDate() + 7);
      const draft: FormState = {
        title: a.title,
        location: a.location,
        startAt: toLocalInput(start),
        durationMin: 180,
        capacity: a.capacity,
        guaranteeOn: a.guaranteeMode === 'GUARANTEE',
        guaranteeAmount: Math.round(a.guaranteeAmount / 100),
        minCreditScore: 80,
        description: '',
        theme: a.theme ?? 'classic',
      };
      setConfirmCancel(null);
      setResendDraft(draft);
      setForm(draft);
      setOpen(true);
      setToast({ msg: '原活动已取消并退款，内容已带入表单，确认时间后即可重发', tone: 'amber' });
      load();
    } catch (e) {
      setToast({ msg: (e as Error).message, tone: 'red' });
    } finally {
      setSaving(false);
    }
  }

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

  const picked = getTheme(form.theme);

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">主理人台</h1>
          <p className="mt-1.5 text-[13px] text-muted">
            发布活动、核销、取消与保证金处理都在这里。重复操作幂等返回，不会重复退款。
          </p>
        </div>
        <button
          className="btn btn-primary shrink-0"
          onClick={() => {
            if (!open) {
              // 打开表单时才读取当前时间，缺省定在两天后的整点
              const d = new Date(Date.now() + 2 * 24 * 3600 * 1000);
              d.setMinutes(0, 0, 0);
              setForm({ ...emptyForm(), startAt: toLocalInput(d) });
            }
            setResendDraft(null);
            setOpen((v) => !v);
          }}
        >
          {open ? '收起表单' : '+ 发布活动'}
        </button>
      </div>

      {/* ============ 发布表单 ============ */}
      {open && (
        <div className="card mt-5 overflow-hidden">
          {/* 实时预览头图 */}
          <div
            className="px-5 py-6"
            style={{ background: picked.gradient }}
          >
            <p
              className="text-[11px] font-medium uppercase tracking-[0.16em]"
              style={{ color: picked.dark ? '#FFB86B' : picked.accent, opacity: 0.85 }}
            >
              {picked.emoji} {picked.label}
            </p>
            <h2
              className="mt-1.5 text-[20px] font-semibold leading-snug tracking-tight"
              style={{ color: picked.dark ? '#fff' : '#1F2A1B' }}
            >
              {form.title.trim() || '填写标题，这里会实时预览'}
            </h2>
            <p
              className="mt-1.5 text-[12.5px]"
              style={{ color: picked.dark ? 'rgba(255,255,255,.78)' : picked.accent }}
            >
              {form.location.trim() || '集合地点'} · {form.startAt ? fmtTime(new Date(form.startAt).toISOString()) : '时间'}
            </p>
          </div>

          <div className="space-y-5 p-5">
            {/* 基础字段 */}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[12.5px] font-medium">活动标题</span>
                <input
                  className="input"
                  placeholder="例：周六香山轻徒步 · 秋色线"
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12.5px] font-medium">集合地点</span>
                <input
                  className="input"
                  placeholder="例：北京 · 香山公园东门"
                  value={form.location}
                  onChange={(e) => set('location', e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12.5px] font-medium">开始时间（T0）</span>
                <input
                  type="datetime-local"
                  className="input"
                  value={form.startAt}
                  onChange={(e) => set('startAt', e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12.5px] font-medium">时长（分钟）</span>
                <input
                  type="number"
                  min={30}
                  step={30}
                  className="input"
                  value={form.durationMin}
                  onChange={(e) => set('durationMin', Number(e.target.value))}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12.5px] font-medium">人数上限</span>
                <input
                  type="number"
                  min={1}
                  className="input"
                  value={form.capacity}
                  onChange={(e) => set('capacity', Number(e.target.value))}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12.5px] font-medium">信用分门槛</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="input"
                  value={form.minCreditScore}
                  onChange={(e) => set('minCreditScore', Number(e.target.value))}
                />
                <span className="mt-1 block text-[11px] text-muted">0 表示不限制</span>
              </label>
            </div>

            {/* 保证金 */}
            <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-medium">收取保证金</p>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
                    到场核销全额原路退；爽约扣款全部分给按时到场的人，平台不截留。
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.guaranteeOn}
                  onClick={() => set('guaranteeOn', !form.guaranteeOn)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    form.guaranteeOn ? 'bg-moss-500' : 'bg-stone-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      form.guaranteeOn ? 'left-[22px]' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
              {form.guaranteeOn && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[12.5px] text-muted">金额 ¥</span>
                  <input
                    type="number"
                    min={1}
                    className="input !w-28"
                    value={form.guaranteeAmount}
                    onChange={(e) => set('guaranteeAmount', Number(e.target.value))}
                  />
                  <span className="text-[11.5px] text-muted">元 / 人</span>
                </div>
              )}
            </div>

            {/* 模板选择 */}
            <div>
              <p className="mb-2 text-[12.5px] font-medium">视觉模板</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {THEMES.map((t) => {
                  const active = form.theme === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => set('theme', t.key)}
                      className={`overflow-hidden rounded-xl border text-left transition-all ${
                        active
                          ? 'border-moss-500 ring-2 ring-moss-500/25'
                          : 'border-stone-200 hover:border-stone-300'
                      }`}
                    >
                      <div
                        className="flex h-14 items-end px-2.5 pb-1.5"
                        style={{ background: t.gradient }}
                      >
                        <span
                          className="text-[15px]"
                          style={{ filter: t.dark ? 'brightness(0) invert(1)' : 'none' }}
                        >
                          {t.emoji}
                        </span>
                      </div>
                      <div className="px-2.5 py-1.5">
                        <p className="text-[12px] font-medium leading-tight">{t.label}</p>
                        <p className="mt-0.5 text-[10.5px] text-muted">{t.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 描述 + 兴趣点 */}
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-medium">活动介绍</span>
              <textarea
                className="input min-h-[92px] resize-y"
                placeholder="说清楚路线、强度、需要带的装备，报名的人会更放心。"
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
              />
            </label>
            <div>
              <p className="mb-1.5 text-[12px] text-muted">快速追加卖点（点击添加）</p>
              <div className="flex flex-wrap gap-1.5">
                {HOOKS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() =>
                      set(
                        'description',
                        form.description ? `${form.description.replace(/\s*$/, '')}\n· ${h}` : `· ${h}`
                      )
                    }
                    className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11.5px] text-stone-600 transition-colors hover:border-moss-300 hover:text-moss-700"
                  >
                    + {h}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-stone-100 pt-4">
              {resendDraft && (
                <span className="mr-auto text-[11.5px] text-amber-600">
                  正在重发，原活动已取消并退款
                </span>
              )}
              <button className="btn btn-ghost" onClick={() => setOpen(false)} disabled={saving}>
                取消
              </button>
              <button className="btn btn-primary" onClick={publish} disabled={saving}>
                {saving ? '发布中…' : '立即发布'}
              </button>
            </div>
          </div>
        </div>
      )}

      <h2 className="mt-7 mb-3 text-[15px] font-semibold">我的活动</h2>
      {!acts && <Spinner />}
      <div className="space-y-2.5">
        {acts?.map((a) => {
          const st = STATUS_LABEL[a.status] ?? { text: a.status, tone: 'gray' };
          const th = getTheme(a.theme);
          return (
            <div key={a.id} className="card overflow-hidden">
              <Link
                href={`/activity/${a.id}`}
                className="flex items-center gap-4 p-4 transition-colors hover:bg-stone-50/60"
              >
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[18px]"
                  style={{ background: th.gradient }}
                >
                  {th.emoji}
                </div>
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

              {/* 快捷操作 */}
              {a.status !== 'CANCELLED' && (
                <div className="flex items-center gap-2 border-t border-stone-100 bg-stone-50/40 px-4 py-2">
                  <button
                    className="text-[12px] text-stone-500 transition-colors hover:text-ink"
                    onClick={() => setConfirmCancel(a)}
                  >
                    取消活动
                  </button>
                  <span className="text-stone-200">|</span>
                  <button
                    className="text-[12px] text-moss-700 transition-colors hover:text-moss-800"
                    onClick={() => cancelAndResend(a)}
                  >
                    取消并重发
                  </button>
                  <span className="ml-auto text-[11px] text-stone-400">
                    改期须取消后重发（不支持直接改时间）
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 取消确认 */}
      {confirmCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4">
          <div className="card w-full max-w-md p-5">
            <h3 className="text-[15px] font-semibold">确认取消这场活动？</h3>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
              「{confirmCancel.title}」将有 <span className="text-ink">{confirmCancel.joined}</span> 位
              报名者的保证金被全额原路退回。取消后无法恢复，如需再办请重新发布。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn btn-ghost" onClick={() => setConfirmCancel(null)}>
                再想想
              </button>
              <button
                className="btn !bg-red-600 !text-white hover:!bg-red-700"
                disabled={saving}
                onClick={() => doCancel(confirmCancel)}
              >
                {saving ? '处理中…' : '确认取消'}
              </button>
            </div>
          </div>
        </div>
      )}

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
