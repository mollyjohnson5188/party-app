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
    <div className="mx-auto max-w-4xl sm:px-5 sm:py-8">
      {/* ================= 移动端：Reddit 式吸顶搜索条 ================= */}
      <div className="sticky top-14 z-30 border-b border-stone-200/80 bg-[#f7f6f2]/95 backdrop-blur-md sm:hidden">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="flex h-9 flex-1 items-center gap-2 rounded-full border border-stone-200 bg-white px-3.5">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="2.2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-stone-400"
              placeholder="搜索帖子"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setQ(qInput.trim());
              }}
            />
            {qInput && (
              <button
                aria-label="清除"
                onClick={() => { setQInput(''); setQ(''); }}
                className="shrink-0 text-[15px] leading-none text-stone-400"
              >
                ×
              </button>
            )}
          </div>
          <button
            onClick={() => setComposing((v) => !v)}
            aria-label="发帖"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 20h4l10-10a2.8 2.8 0 10-4-4L4 16v4z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* 版块 pill 横滑 */}
        <div className="scrollbar-none flex gap-1.5 overflow-x-auto px-3 pb-2">
          <BoardPill active={board === ''} onClick={() => setBoard('')}>
            🗂️ 全部
          </BoardPill>
          {(boards ?? []).map((b) => (
            <BoardPill
              key={b.id}
              active={board === b.id}
              onClick={() => setBoard(board === b.id ? '' : b.id)}
            >
              {b.emoji} {b.name}
              {b.postCount > 0 && <span className="ml-1 opacity-55">{b.postCount}</span>}
            </BoardPill>
          ))}
          <span className="w-1 shrink-0" />
        </div>
      </div>

      {/* 移动端标题区（紧凑） */}
      <div className="flex items-center justify-between px-5 pb-1 pt-4 sm:hidden">
        <div className="flex items-center gap-1.5">
          {(['latest', 'hot'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`rounded-full px-3 py-1 text-[12.5px] transition-colors ${
                sort === s ? 'bg-moss-600 font-medium text-white' : 'bg-stone-200/60 text-stone-600'
              }`}
            >
              {s === 'latest' ? '最新' : '最热'}
            </button>
          ))}
          <button
            onClick={() => setOnlyFollowed((v) => !v)}
            className={`rounded-full px-3 py-1 text-[12.5px] transition-colors ${
              onlyFollowed ? 'bg-moss-500 text-white' : 'bg-stone-200/60 text-stone-600'
            }`}
          >
            关注{follows.length > 0 && ` ${follows.length}`}
          </button>
        </div>
      </div>

      {/* ================= 桌面端头部 ================= */}
      <div className="hidden items-start justify-between gap-4 sm:flex">
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
        <div className="card mx-5 mt-3 p-5 sm:mx-0 sm:mt-5">
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

      {/* 版块（桌面端网格，移动端已在上方 pill 条） */}
      <div className="mt-6 hidden grid-cols-2 gap-2 sm:grid sm:grid-cols-3 lg:grid-cols-5">
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
          <div className="col-span-2 rounded-xl border border-dashed border-stone-200 p-4 text-center text-[12px] text-muted sm:col-span-3 lg:col-span-5">
            还没有关注的版块，点版块右上角「+ 关注」即可
          </div>
        )}
      </div>

      {/* 搜索 + 排序（桌面端） */}
      <div className="mt-5 hidden flex-wrap items-center gap-2 sm:flex">
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

      {/* 帖子列表：移动端信息流 / 桌面端卡片 */}
      <div className="mt-3 pb-2 sm:mt-4">
        {!posts && <div className="py-6"><Spinner label="加载圈子" /></div>}
        {posts && posts.length === 0 && (
          <div className="card mx-5 p-10 text-center sm:mx-0">
            <p className="text-[14px] text-muted">
              {q ? `没有找到「${q}」相关帖子` : '这里还很安静，来发第一个帖子吧'}
            </p>
            {!q && (
              <button className="btn btn-primary mt-3" onClick={() => setComposing(true)}>
                发帖
              </button>
            )}
          </div>
        )}
        <div className="divide-y divide-stone-200/70 border-y border-stone-200/70 bg-[#f7f6f2] sm:space-y-2.5 sm:divide-y-0 sm:border-0 sm:bg-transparent">
          {(posts ?? []).map((p) => (
            <Link
              key={p.id}
              href={`/circle/${p.id}`}
              className="block px-4 py-3 active:bg-stone-100 sm:card sm:p-4 sm:transition-all sm:hover:border-moss-300 sm:hover:shadow-[0_6px_20px_-14px_rgba(31,52,29,0.35)]"
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-[15px] sm:text-[16px]">{p.board.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[14.5px] font-semibold leading-snug tracking-tight sm:font-medium">
                      {p.isPinned && (
                        <span className="mr-1.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-700">
                          置顶
                        </span>
                      )}
                      {p.title}
                    </h3>
                    <span className="shrink-0 text-[11px] text-stone-400 sm:text-[11.5px]">
                      {relTime(p.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-stone-500 sm:text-muted">
                    {p.excerpt}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-stone-400 sm:text-muted">
                    <span className="text-stone-500">u/{p.author.name}</span>
                    <span className="rounded-full bg-stone-200/60 px-1.5 py-0.5 text-[10.5px] text-stone-600 sm:hidden">
                      {p.board.name}
                    </span>
                    <span className="hidden text-stone-300 sm:inline">·</span>
                    <span className="hidden sm:inline">{p.board.name}</span>
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

function BoardPill({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12.5px] transition-colors ${
        active
          ? 'border-moss-600 bg-moss-600 text-white'
          : 'border-stone-200 bg-white text-stone-600'
      }`}
    >
      {children}
    </button>
  );
}
