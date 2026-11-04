'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, apiPost, fmtTime, relTime } from '@/lib/client';
import { Spinner, Toast } from '@/components/ui';

interface Board {
  id: string;
  name: string;
  slug: string;
  emoji: string;
  description: string;
  postCount: number;
}

interface Post {
  id: string;
  title: string;
  excerpt: string;
  likeCount: number;
  replyCount: number;
  isPinned: boolean;
  createdAt: string;
  activityTitle: string | null;
  board: { id: string; name: string; emoji: string; slug: string };
  author: { id: string; name: string };
  liked: boolean;
}

export default function CirclePage() {
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [board, setBoard] = useState<string>('');
  const [sort, setSort] = useState<'latest' | 'hot'>('latest');
  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');
  const [composing, setComposing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: 'moss' | 'red' | 'amber' } | null>(null);

  const [follows, setFollows] = useState<string[]>([]);
  const [onlyFollowed, setOnlyFollowed] = useState(false);
  const [form, setForm] = useState({ boardId: 'bd_outdoor', title: '', content: '' });
  const [posting, setPosting] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const loadBoards = useCallback(() => {
    api<Board[]>('/api/circle/boards').then(setBoards).catch(() => setBoards([]));
  }, []);

  const loadPosts = useCallback(() => {
    const p = new URLSearchParams();
    if (board) p.set('board', board);
    p.set('sort', sort);
    if (q) p.set('q', q);
    api<Post[]>(`/api/circle/posts?${p.toString()}`)
      .then(setPosts)
      .catch(() => setPosts([]));
  }, [board, sort, q]);

  useEffect(() => {
    loadBoards();
    api<{ boards: string[] }>('/api/circle/follow')
      .then((r) => setFollows(r.boards ?? []))
      .catch(() => setFollows([]));
  }, [loadBoards]);
  useEffect(() => loadPosts(), [loadPosts]);

  async function toggleFollow(boardId: string) {
    const following = !follows.includes(boardId);
    setFollows((f) => (following ? [...f, boardId] : f.filter((x) => x !== boardId)));
    try {
      await apiPost('/api/circle/follow', { boardId, follow: following });
    } catch {
      // 回滚乐观更新
      setFollows((f) => (following ? f.filter((x) => x !== boardId) : [...f, boardId]));
    }
  }

  async function submit() {
    setFormErr(null);
    if (!form.title.trim()) return setFormErr('请填写标题');
    if (!form.content.trim()) return setFormErr('请填写正文');
    setPosting(true);
    try {
      const r = await apiPost<{ id: string; pending: boolean }>('/api/circle/posts', {
        boardId: form.boardId,
        title: form.title.trim(),
        content: form.content.trim(),
      });
      setToast({
        msg: r.pending ? '已提交，管理员审核通过后展示' : '发布成功',
        tone: r.pending ? 'amber' : 'moss',
      });
      setComposing(false);
      setForm({ boardId: form.boardId, title: '', content: '' });
      loadPosts();
      loadBoards();
    } catch (e) {
      setFormErr((e as Error).message || '发布失败');
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">圈子</h1>
          <p className="mt-1.5 text-[13px] text-muted">
            路线怎么选、装备买什么、上次那场局有多好——这里都是同类人说的话。
          </p>
        </div>
        <button
          className="btn btn-primary shrink-0"
          onClick={() => setComposing((v) => !v)}
        >
          {composing ? '收起' : '✏️ 发帖'}
        </button>
      </div>

      {/* 发帖 */}
      {composing && (
        <div className="card mt-5 p-5">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {(boards ?? []).map((b) => (
              <button
                key={b.id}
                onClick={() => setForm((f) => ({ ...f, boardId: b.id }))}
                className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
                  form.boardId === b.id
                    ? 'border-moss-500 bg-moss-500 text-white'
                    : 'border-stone-200 bg-white text-stone-600 hover:border-moss-300'
                }`}
              >
                {b.emoji} {b.name}
              </button>
            ))}
          </div>
          <input
            className="input mb-2.5"
            placeholder="标题：一句话说清你想聊什么"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <textarea
            className="input min-h-[120px] resize-y"
            placeholder="正文：路线、装备、经验、心情，怎么想的就怎么写。"
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
          />
          {formErr && (
            <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
              {formErr}
            </p>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => setComposing(false)}>
              取消
            </button>
            <button className="btn btn-primary" onClick={submit} disabled={posting}>
              {posting ? '发布中…' : '发布'}
            </button>
          </div>
        </div>
      )}

      {/* 版块 */}
      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <button
          onClick={() => setBoard('')}
          className={`rounded-xl border p-3 text-left transition-all ${
            board === ''
              ? 'border-moss-500 bg-moss-50/70 ring-2 ring-moss-500/20'
              : 'border-stone-200 bg-white hover:border-moss-300'
          }`}
        >
          <span className="text-[17px]">🗂️</span>
          <p className="mt-1 text-[12.5px] font-medium">全部</p>
          <p className="text-[11px] text-muted tabular">
            {(boards ?? []).reduce((s, b) => s + b.postCount, 0)} 帖
          </p>
        </button>
        {(boards ?? [])
          .filter((b) => !onlyFollowed || follows.includes(b.id))
          .map((b) => {
            const followed = follows.includes(b.id);
            return (
              <div
                key={b.id}
                className={`relative rounded-xl border transition-all ${
                  board === b.id
                    ? 'border-moss-500 bg-moss-50/70 ring-2 ring-moss-500/20'
                    : 'border-stone-200 bg-white hover:border-moss-300'
                }`}
              >
                <button
                  onClick={() => setBoard(board === b.id ? '' : b.id)}
                  title={b.description}
                  className="w-full p-3 pb-1 text-left"
                >
                  <span className="text-[17px]">{b.emoji}</span>
                  <p className="mt-1 truncate text-[12.5px] font-medium">{b.name}</p>
                  <p className="text-[11px] text-muted tabular">{b.postCount} 帖</p>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFollow(b.id);
                  }}
                  className={`absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[10px] transition-colors ${
                    followed
                      ? 'bg-moss-500 text-white'
                      : 'bg-stone-100 text-stone-500 hover:bg-moss-100 hover:text-moss-700'
                  }`}
                  title={followed ? '取消关注' : '关注版块'}
                >
                  {followed ? '已关注' : '+ 关注'}
                </button>
              </div>
            );
          })}
        {onlyFollowed && follows.length === 0 && (
          <div className="col-span-2 sm:col-span-3 lg:col-span-5 rounded-xl border border-dashed border-stone-200 p-4 text-center text-[12px] text-muted">
            还没有关注的版块，点版块右上角「+ 关注」即可
          </div>
        )}
      </div>

      {/* 搜索 + 排序 */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-stone-200 bg-white">
          {(['latest', 'hot'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`px-3 py-1.5 text-[12.5px] transition-colors ${
                sort === s ? 'bg-moss-500 text-white' : 'text-stone-600 hover:bg-stone-50'
              }`}
            >
              {s === 'latest' ? '最新' : '最热'}
            </button>
          ))}
        </div>
        <button
          onClick={() => setOnlyFollowed((v) => !v)}
          className={`rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
            onlyFollowed
              ? 'border-moss-500 bg-moss-500 text-white'
              : 'border-stone-200 bg-white text-stone-600 hover:border-moss-300'
          }`}
        >
          只看关注 {follows.length > 0 && `(${follows.length})`}
        </button>
        <div className="flex flex-1 items-center gap-2">
          <input
            className="input !py-1.5 !text-[12.5px]"
            placeholder="搜索标题或内容…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setQ(qInput.trim());
            }}
          />
          <button className="btn btn-ghost !py-1.5 !text-[12.5px]" onClick={() => setQ(qInput.trim())}>
            搜索
          </button>
          {q && (
            <button
              className="text-[12px] text-muted underline-offset-2 hover:underline"
              onClick={() => {
                setQ('');
                setQInput('');
              }}
            >
              清除
            </button>
          )}
        </div>
      </div>

      {/* 帖子列表 */}
      <div className="mt-4">
        {!posts && <Spinner label="加载圈子" />}
        {posts && posts.length === 0 && (
          <div className="card p-10 text-center">
            <p className="text-[14px] text-muted">这里还很安静，来发第一个帖子吧</p>
            <button className="btn btn-primary mt-3" onClick={() => setComposing(true)}>
              发帖
            </button>
          </div>
        )}
        <div className="space-y-2.5">
          {(posts ?? []).map((p) => (
            <Link
              key={p.id}
              href={`/circle/${p.id}`}
              className="card block p-4 transition-all hover:border-moss-300 hover:shadow-[0_6px_20px_-14px_rgba(31,52,29,0.35)]"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-[16px]">{p.board.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[14.5px] font-medium leading-snug tracking-tight">
                      {p.isPinned && (
                        <span className="mr-1.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-700">
                          置顶
                        </span>
                      )}
                      {p.title}
                    </h3>
                    <span className="shrink-0 text-[11.5px] text-muted">{relTime(p.createdAt)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-muted">
                    {p.excerpt}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted">
                    <span className="text-stone-500">{p.author.name}</span>
                    <span className="text-stone-300">·</span>
                    <span>{p.board.name}</span>
                    <span className="ml-auto flex items-center gap-3">
                      <span className={p.liked ? 'text-rose-500' : ''}>♥ {p.likeCount}</span>
                      <span>💬 {p.replyCount}</span>
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {toast && <Toast message={toast.msg} tone={toast.tone} onClose={() => setToast(null)} />}
    </div>
  );
}
