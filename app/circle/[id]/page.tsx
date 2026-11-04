'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { api, apiPost, fmtTime, relTime } from '@/lib/client';
import { Spinner, Toast } from '@/components/ui';

interface Reply {
  id: string;
  content: string;
  createdAt: string;
  parentId: string | null;
  author: { id: string; name: string };
}

interface PostDetail {
  id: string;
  title: string;
  content: string;
  likeCount: number;
  replyCount: number;
  createdAt: string;
  activityId: string | null;
  activityTitle: string | null;
  board: { id: string; name: string; emoji: string; slug: string };
  author: { id: string; name: string };
  liked: boolean;
  replies: Reply[];
}

export default function PostPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-5 py-16">
          <Spinner label="加载帖子" />
        </div>
      }
    >
      <PostContent />
    </Suspense>
  );
}

function PostContent() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [d, setD] = useState<PostDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: 'moss' | 'red' | 'amber' } | null>(null);

  const load = useCallback(() => {
    api<PostDetail>(`/api/circle/posts/${id}`)
      .then(setD)
      .catch((e) => setErr(e.message));
  }, [id]);

  useEffect(() => load(), [load]);

  async function toggleLike() {
    if (!d) return;
    try {
      const r = await apiPost<{ liked: boolean; likeCount: number }>(`/api/circle/posts/${id}`, {
        action: 'like',
      });
      setD({ ...d, liked: r.liked || d.liked, likeCount: r.likeCount });
    } catch (e) {
      setToast({ msg: (e as Error).message, tone: 'red' });
    }
  }

  async function sendReply() {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await apiPost(`/api/circle/posts/${id}`, { action: 'reply', content: reply.trim() });
      setReply('');
      setToast({ msg: '回复成功', tone: 'moss' });
      load();
    } catch (e) {
      setToast({ msg: (e as Error).message, tone: 'red' });
    } finally {
      setSending(false);
    }
  }

  if (err) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16">
        <div className="card p-6 text-sm text-red-600">{err}</div>
        <Link href="/circle" className="mt-4 inline-block text-[13px] text-muted hover:text-ink">
          ← 返回圈子
        </Link>
      </div>
    );
  }

  if (!d) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16">
        <Spinner label="加载帖子" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <Link href="/circle" className="text-[12.5px] text-muted hover:text-ink">
        ← 返回圈子
      </Link>

      <div className="mt-4">
        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11.5px] text-stone-600">
          {d.board.emoji} {d.board.name}
        </span>
        <h1 className="mt-2.5 text-[24px] font-semibold leading-snug tracking-tight">{d.title}</h1>
        <p className="mt-2 text-[12.5px] text-muted">
          <span className="text-ink">{d.author.name}</span> · {fmtTime(d.createdAt)} · {relTime(d.createdAt)}
        </p>
      </div>

      {d.activityId && (
        <Link
          href={`/activity/${d.activityId}`}
          className="mt-4 flex items-center gap-2 rounded-lg border border-moss-200 bg-moss-50/60 px-3 py-2 text-[12.5px] text-moss-700 hover:bg-moss-50"
        >
          🎯 关联活动：{d.activityTitle}
          <span className="ml-auto text-[11px]">去看看 →</span>
        </Link>
      )}

      <div className="card mt-4 p-5">
        <p className="whitespace-pre-wrap text-[14px] leading-[1.85] text-ink">{d.content}</p>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={toggleLike}
          className={`btn !py-1.5 !text-[12.5px] ${
            d.liked ? '!bg-rose-50 !text-rose-600 !border-rose-200' : 'btn-ghost'
          }`}
        >
          {d.liked ? '♥ 已赞' : '♡ 点赞'} {d.likeCount}
        </button>
        <span className="text-[12px] text-muted">{d.replyCount} 条回复</span>
      </div>

      {/* 回复列表 */}
      <h2 className="mt-7 mb-3 text-[15px] font-semibold">回复</h2>
      {d.replies.length === 0 && (
        <p className="text-[13px] text-muted">还没有人回复，来说第一句吧。</p>
      )}
      <div className="space-y-2.5">
        {d.replies.map((r) => (
          <div key={r.id} className="card p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-moss-100 text-[10px] font-medium text-moss-700">
                {r.author.name.slice(0, 1)}
              </span>
              <span className="text-[12.5px] font-medium">{r.author.name}</span>
              <span className="text-[11px] text-muted">{relTime(r.createdAt)}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-ink/90">
              {r.content}
            </p>
          </div>
        ))}
      </div>

      {/* 回复框 */}
      <div className="card mt-5 p-4">
        <textarea
          className="input min-h-[88px] resize-y"
          placeholder="说点什么…"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
        />
        <div className="mt-2.5 flex justify-end">
          <button className="btn btn-primary" onClick={sendReply} disabled={sending || !reply.trim()}>
            {sending ? '发送中…' : '发送回复'}
          </button>
        </div>
      </div>

      {toast && <Toast message={toast.msg} tone={toast.tone} onClose={() => setToast(null)} />}
    </div>
  );
}
