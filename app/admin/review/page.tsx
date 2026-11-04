'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, apiPost, fmtTime, relTime } from '@/lib/client';
import { Spinner, Toast } from '@/components/ui';

interface PendingPost {
  id: string;
  title: string;
  excerpt: string;
  createdAt: string;
  board: { name: string; emoji: string };
  author: { id: string; name: string };
}

export default function AdminReviewPage() {
  const [rows, setRows] = useState<PendingPost[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<PendingPost | null>(null);
  const [reason, setReason] = useState('');
  const [toast, setToast] = useState<{ msg: string; tone: 'moss' | 'red' | 'amber' } | null>(null);

  const load = useCallback(() => {
    api<PendingPost[]>('/api/admin/circle/review')
      .then(setRows)
      .catch((e) => setErr(e.message));
  }, []);

  useEffect(() => load(), [load]);

  async function decide(post: PendingPost, approved: boolean, why?: string) {
    setBusy(post.id);
    try {
      await apiPost('/api/admin/circle/review', { postId: post.id, approved, reason: why });
      setToast({ msg: approved ? '已通过，帖子已发布' : '已驳回', tone: approved ? 'moss' : 'amber' });
      setRejectFor(null);
      setReason('');
      load();
    } catch (e) {
      setToast({ msg: (e as Error).message, tone: 'red' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">帖子审核</h1>
          <p className="mt-1.5 text-[13px] text-muted">
            普通用户发帖默认进入待审队列。管理员发帖免审直发。
          </p>
        </div>
        <Link href="/circle" className="btn btn-ghost shrink-0 !text-[12.5px]">
          去圈子
        </Link>
      </div>

      {err && (
        <div className="card mt-5 border-red-200 bg-red-50 p-4 text-[13px] text-red-700">
          {err}
          <p className="mt-1.5 text-[11.5px] text-red-600/80">
            该页面需要管理员账号登录。若你还没有管理员，请用管理员邀请码注册。
          </p>
        </div>
      )}

      {!rows && !err && (
        <div className="py-12">
          <Spinner label="加载待审列表" />
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="card mt-5 p-10 text-center">
          <p className="text-[14px] text-muted">队列已清空，没有待审帖子 ✅</p>
        </div>
      )}

      <div className="mt-5 space-y-2.5">
        {rows?.map((p) => (
          <div key={p.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[14.5px] font-medium leading-snug">
                  <span className="mr-1.5">{p.board.emoji}</span>
                  {p.title}
                </p>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  {p.author.name} · {p.board.name} · {relTime(p.createdAt)}（{fmtTime(p.createdAt)}）
                </p>
              </div>
              <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10.5px] text-amber-700">
                待审核
              </span>
            </div>
            <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-[12.5px] leading-relaxed text-muted">
              {p.excerpt}
            </p>
            <div className="mt-3 flex gap-2 border-t border-stone-100 pt-3">
              <button
                className="btn btn-primary !py-1.5 !text-[12px]"
                disabled={busy === p.id}
                onClick={() => decide(p, true)}
              >
                {busy === p.id ? '处理中…' : '通过'}
              </button>
              <button
                className="btn btn-ghost !py-1.5 !text-[12px]"
                disabled={busy === p.id}
                onClick={() => setRejectFor(p)}
              >
                驳回
              </button>
              <Link
                href={`/circle/${p.id}`}
                target="_blank"
                className="ml-auto self-center text-[11.5px] text-muted hover:text-ink"
              >
                查看全文 ↗
              </Link>
            </div>
          </div>
        ))}
      </div>

      {rejectFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4">
          <div className="card w-full max-w-md p-5">
            <h3 className="text-[15px] font-semibold">驳回「{rejectFor.title}」</h3>
            <p className="mt-1.5 text-[12.5px] text-muted">填写理由，作者可见。</p>
            <textarea
              className="input mt-3 h-24 resize-none"
              placeholder="例如：含广告引流内容 / 与版块主题不符"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn btn-ghost" onClick={() => setRejectFor(null)}>
                取消
              </button>
              <button
                className="btn !bg-red-600 !text-white hover:!bg-red-700"
                disabled={busy === rejectFor.id}
                onClick={() => decide(rejectFor, false, reason || undefined)}
              >
                确认驳回
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.msg} tone={toast.tone} onClose={() => setToast(null)} />}
    </div>
  );
}
