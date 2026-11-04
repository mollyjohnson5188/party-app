'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, apiPost } from '@/lib/client';
import { Spinner, Toast } from '@/components/ui';

interface Category {
  id: string;
  name: string;
  slug: string;
  postCount: number;
}

interface AdminPost {
  id: string;
  slug: string;
  title: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  isFeatured: boolean;
  readCount: number;
  publishedAt: string | null;
  categoryName: string;
  coverEmoji: string;
}

interface ActivityLite {
  id: string;
  title: string;
  startAt: string;
}

const COVERS = ['🏔️', '🥾', '🎒', '⛺', '🚴', '🏸', '🌊', '🧗', '🌄', '🧭', '🔥', '☀️'];

const STARTER = `## 先说结论

把最关键的判断写在这里。

## 路线与时间

- 起点：xxx
- 里程：xx 公里
- 爬升：xxx 米
- 建议时长：x 小时

## 装备清单

| 物品 | 是否需要 | 备注 |
| --- | --- | --- |
| 登山鞋 | 必带 | 中帮护踝 |
| 头灯 | 必带 | 备电池 |

## 注意事项

> 把最容易踩的坑写在这里。`;

export default function AdminBlogPage() {
  const [cats, setCats] = useState<Category[]>([]);
  const [posts, setPosts] = useState<AdminPost[] | null>(null);
  const [acts, setActs] = useState<ActivityLite[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: 'moss' | 'red' | 'amber' } | null>(null);

  // 编辑器状态
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [summary, setSummary] = useState('');
  const [coverEmoji, setCoverEmoji] = useState('🏔️');
  const [tags, setTags] = useState('');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [keywords, setKeywords] = useState('');
  const [featured, setFeatured] = useState(false);
  const [activityIds, setActivityIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const loadPosts = useCallback(() => {
    api<{ items: AdminPost[] }>('/api/admin/blog/posts')
      .then((d) => setPosts(d.items))
      .catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    api<Category[]>('/api/blog/categories')
      .then((list) => {
        setCats(list);
        setCategoryId((cur) => cur || list[0]?.id || '');
      })
      .catch((e) => setErr(e.message));
    api<{ items: ActivityLite[] }>('/api/activities?status=PUBLISHED&limit=30')
      .then((d) => setActs(d.items ?? []))
      .catch(() => {});
    loadPosts();
  }, [loadPosts]);

  function resetForm() {
    setEditingId(null);
    setTitle('');
    setContent('');
    setSummary('');
    setCoverEmoji('🏔️');
    setTags('');
    setSeoTitle('');
    setSeoDescription('');
    setKeywords('');
    setFeatured(false);
    setActivityIds([]);
    setFormError(null);
  }

  function openNew() {
    resetForm();
    setContent(STARTER);
    setOpen(true);
  }

  function openEdit(p: AdminPost) {
    resetForm();
    setEditingId(p.id);
    setTitle(p.title);
    setCoverEmoji(p.coverEmoji);
    setFeatured(p.isFeatured);
    const cat = cats.find((c) => c.name === p.categoryName);
    if (cat) setCategoryId(cat.id);
    // 拉详情
    api<{
      title: string;
      content: string;
      summary: string;
      tags: string[];
      seoTitle: string | null;
      seoDescription: string | null;
      keywords: string | null;
      categoryId: string;
      activityIds: string[];
    }>(`/api/admin/blog/posts/${p.id}`)
      .then((d) => {
        setTitle(d.title);
        setContent(d.content);
        setSummary(d.summary ?? '');
        setTags((d.tags ?? []).join(', '));
        setSeoTitle(d.seoTitle ?? '');
        setSeoDescription(d.seoDescription ?? '');
        setKeywords(d.keywords ?? '');
        setCategoryId(d.categoryId);
        setActivityIds(d.activityIds ?? []);
      })
      .catch((e) => setToast({ msg: e.message, tone: 'red' }));
    setOpen(true);
  }

  async function save(draft: boolean) {
    setFormError(null);
    if (!title.trim()) return setFormError('请填写标题');
    if (!content.trim()) return setFormError('请填写正文');
    if (!categoryId) return setFormError('请选择分类');

    setSaving(true);
    try {
      const tagArr = tags
        .split(/[,，\s]+/)
        .map((t) => t.replace(/^#/, '').trim())
        .filter(Boolean)
        .slice(0, 8);

      const res = await apiPost<{ id: string; slug: string; status: string }>('/api/blog/posts', {
        id: editingId ?? undefined,
        title,
        content,
        categoryId,
        summary: summary.trim() || undefined,
        coverEmoji,
        tags: tagArr,
        seoTitle: seoTitle.trim() || undefined,
        seoDescription: seoDescription.trim() || undefined,
        keywords: keywords.trim() || undefined,
        featured,
        draft,
        activityIds,
      });
      setToast({
        msg: draft ? '已存为草稿' : editingId ? '已更新并发布' : '已发布',
        tone: 'moss',
      });
      setOpen(false);
      resetForm();
      loadPosts();
      if (!draft) window.open(`/blog/${res.slug}`, '_blank');
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  /** 在光标处插入 Markdown 记号 */
  function insert(before: string, after = '', placeholder = '') {
    const el = bodyRef.current;
    if (!el) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const sel = content.slice(s, e) || placeholder;
    const next = content.slice(0, s) + before + sel + after + content.slice(e);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = s + before.length;
      el.selectionEnd = s + before.length + sel.length;
    });
  }

  const wordCount = useMemo(() => content.replace(/\s/g, '').length, [content]);
  const tagPreview = useMemo(
    () =>
      tags
        .split(/[,，\s]+/)
        .map((t) => t.replace(/^#/, '').trim())
        .filter(Boolean)
        .slice(0, 8),
    [tags]
  );

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">博客管理</h1>
          <p className="mt-1.5 text-[13px] text-muted">
            发文章做 SEO 获客。文章会自动进入 sitemap，并带结构化数据给搜索引擎。
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link href="/blog" target="_blank" className="btn btn-ghost !text-[12.5px]">
            看前台 ↗
          </Link>
          <button className="btn btn-primary !text-[12.5px]" onClick={openNew}>
            写文章
          </button>
        </div>
      </div>

      {err && (
        <div className="card mt-5 border-red-200 bg-red-50 p-4 text-[13px] text-red-700">
          {err}
          <p className="mt-1.5 text-[11.5px] text-red-600/80">
            该页面需要管理员账号登录。若你还没有管理员，请用管理员邀请码注册。
          </p>
        </div>
      )}

      {/* 文章列表 */}
      {!posts && !err && (
        <div className="py-12">
          <Spinner label="加载文章" />
        </div>
      )}

      {posts && posts.length === 0 && (
        <div className="card mt-6 p-10 text-center">
          <p className="text-[14px] text-muted">还没有文章</p>
          <button className="btn btn-primary mt-4" onClick={openNew}>
            写第一篇
          </button>
        </div>
      )}

      <div className="mt-5 space-y-2">
        {posts?.map((p) => (
          <div key={p.id} className="card flex items-center gap-3 p-4">
            <span className="text-[22px] leading-none">{p.coverEmoji}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium leading-snug">{p.title}</p>
              <p className="mt-0.5 text-[11.5px] text-muted">
                {p.categoryName} · 阅读 {p.readCount}
                {p.publishedAt ? ` · ${new Date(p.publishedAt).toLocaleDateString('zh-CN')}` : ''}
              </p>
            </div>
            {p.isFeatured && (
              <span className="shrink-0 rounded bg-moss-50 px-1.5 py-0.5 text-[10.5px] text-moss-700">
                置顶
              </span>
            )}
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10.5px] ${
                p.status === 'PUBLISHED'
                  ? 'bg-moss-50 text-moss-700'
                  : 'bg-stone-100 text-stone-500'
              }`}
            >
              {p.status === 'PUBLISHED' ? '已发布' : '草稿'}
            </span>
            <button
              className="shrink-0 text-[12px] text-muted hover:text-ink"
              onClick={() => openEdit(p)}
            >
              编辑
            </button>
          </div>
        ))}
      </div>

      {/* 编辑器抽屉 */}
      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/40 px-3 py-6">
          <div className="card mx-auto max-w-3xl p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-semibold">{editingId ? '编辑文章' : '写新文章'}</h2>
              <button
                className="text-[20px] leading-none text-stone-400 hover:text-ink"
                onClick={() => {
                  setOpen(false);
                  resetForm();
                }}
              >
                ×
              </button>
            </div>

            <div className="mt-4 space-y-3.5">
              <div>
                <label className="label">标题 *</label>
                <input
                  className="input"
                  placeholder="例如：北京周边12条新手徒步路线，按体力分级"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">分类 *</label>
                  <select
                    className="input"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                  >
                    {cats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">封面图标</label>
                  <div className="flex flex-wrap gap-1.5">
                    {COVERS.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => setCoverEmoji(e)}
                        className={`h-8 w-8 rounded-lg border text-[17px] leading-none transition ${
                          coverEmoji === e
                            ? 'border-moss-600 bg-moss-50'
                            : 'border-stone-200 bg-white hover:border-moss-300'
                        }`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="label">正文 * （Markdown）</label>
                <div className="mb-1.5 flex flex-wrap gap-1">
                  {[
                    { label: 'H2', fn: () => insert('\n## ', '\n', '小标题') },
                    { label: 'H3', fn: () => insert('\n### ', '\n', '小标题') },
                    { label: '粗体', fn: () => insert('**', '**', '重点') },
                    { label: '列表', fn: () => insert('\n- ', '\n', '条目') },
                    { label: '引用', fn: () => insert('\n> ', '\n', '提示') },
                    { label: '链接', fn: () => insert('[', '](https://)', '文字') },
                    {
                      label: '表格',
                      fn: () =>
                        insert('\n| 列1 | 列2 |\n| --- | --- |\n| 值1 | 值2 |\n', ''),
                    },
                    { label: '分隔线', fn: () => insert('\n---\n', '') },
                  ].map((b) => (
                    <button
                      key={b.label}
                      type="button"
                      onClick={b.fn}
                      className="rounded border border-stone-200 bg-white px-2 py-0.5 text-[11px] text-stone-600 hover:border-moss-300 hover:text-moss-700"
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
                <textarea
                  ref={bodyRef}
                  className="input h-72 resize-y font-mono !text-[12.5px] leading-relaxed"
                  placeholder="## 小标题&#10;&#10;正文内容…"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-stone-400">{wordCount} 字</p>
              </div>

              <div>
                <label className="label">摘要（留空自动截取正文前 160 字）</label>
                <textarea
                  className="input h-16 resize-none !text-[12.5px]"
                  placeholder="显示在列表页和搜索结果里的那段话"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                />
              </div>

              <div>
                <label className="label">标签（逗号或空格分隔，最多 8 个）</label>
                <input
                  className="input"
                  placeholder="徒步, 新手, 北京周边"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                />
                {tagPreview.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {tagPreview.map((t) => (
                      <span
                        key={t}
                        className="rounded bg-stone-100 px-1.5 py-0.5 text-[10.5px] text-stone-500"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <details className="rounded-lg border border-stone-200 bg-stone-50/60 p-3">
                <summary className="cursor-pointer text-[12.5px] font-medium text-stone-700">
                  SEO 高级设置（不改也能用）
                </summary>
                <div className="mt-3 space-y-2.5">
                  <div>
                    <label className="label">SEO 标题（建议 30 字内，含关键词）</label>
                    <input
                      className="input"
                      placeholder={title || '留空则用文章标题'}
                      value={seoTitle}
                      onChange={(e) => setSeoTitle(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">SEO 描述（建议 70–120 字）</label>
                    <textarea
                      className="input h-16 resize-none !text-[12.5px]"
                      placeholder="搜索结果里标题下面那段话"
                      value={seoDescription}
                      onChange={(e) => setSeoDescription(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">关键词（逗号分隔）</label>
                    <input
                      className="input"
                      placeholder="北京徒步, 新手路线, 户外装备"
                      value={keywords}
                      onChange={(e) => setKeywords(e.target.value)}
                    />
                  </div>
                </div>
              </details>

              {acts.length > 0 && (
                <div>
                  <label className="label">关联活动（最多 6 个，显示在文章底部做转化）</label>
                  <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-stone-200 p-2">
                    {acts.map((a) => {
                      const checked = activityIds.includes(a.id);
                      return (
                        <label
                          key={a.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[12.5px] hover:bg-stone-50"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setActivityIds((cur) =>
                                checked
                                  ? cur.filter((x) => x !== a.id)
                                  : cur.length >= 6
                                    ? cur
                                    : [...cur, a.id]
                              )
                            }
                          />
                          <span className="truncate">{a.title}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={featured}
                  onChange={(e) => setFeatured(e.target.checked)}
                />
                设为置顶头条
              </label>

              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
                  {formError}
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-stone-100 pt-4">
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setOpen(false);
                  resetForm();
                }}
              >
                取消
              </button>
              <button className="btn btn-ghost" disabled={saving} onClick={() => save(true)}>
                存草稿
              </button>
              <button className="btn btn-primary" disabled={saving} onClick={() => save(false)}>
                {saving ? '保存中…' : '发布'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.msg} tone={toast.tone} onClose={() => setToast(null)} />}
    </div>
  );
}
