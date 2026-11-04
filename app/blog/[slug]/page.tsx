import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { query, queryOne, getPool } from '@/lib/db';
import { renderMarkdown } from '@/lib/blog/markdown';

const SITE = 'https://uismile.com';

interface PostRow {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  cover_emoji: string;
  tags: string[];
  seo_title: string | null;
  seo_description: string | null;
  keywords: string | null;
  read_count: number;
  published_at: string;
  updated_at: string;
  category_name: string;
  category_slug: string;
  author_name: string;
}

async function getPost(slug: string): Promise<PostRow | null> {
  return queryOne<PostRow>(
    `SELECT p.id, p.slug, p.title, p.summary, p.content, p.cover_emoji, p.tags,
            p.seo_title, p.seo_description, p.keywords, p.read_count,
            p.published_at, p.updated_at,
            c.name AS category_name, c.slug AS category_slug, u.nickname AS author_name
       FROM blog_post p
       JOIN blog_category c ON c.id=p.category_id
       JOIN app_user u ON u.id=p.author_id
      WHERE p.slug=$1 AND p.status='PUBLISHED'`,
    [slug]
  ).catch(() => null);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = await getPost(slug);
  if (!p) return { title: '文章不存在 | 组局' };

  const title = p.seo_title ?? p.title;
  const desc = p.seo_description ?? p.summary;
  const url = `${SITE}/blog/${p.slug}`;

  return {
    title: `${title} | 组局户外博客`,
    description: desc,
    keywords: p.keywords ? p.keywords.split(',').map((k) => k.trim()) : p.tags,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: desc,
      type: 'article',
      url,
      publishedTime: p.published_at,
      modifiedTime: p.updated_at,
      authors: [p.author_name],
      tags: p.tags,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: desc,
    },
  };
}

export default function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<ArticleSkeleton />}>
      <ArticleBody params={params} />
    </Suspense>
  );
}

function ArticleSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <div className="h-3 w-20 animate-pulse rounded bg-stone-100" />
      <div className="mt-6 h-8 w-3/4 animate-pulse rounded bg-stone-100" />
      <div className="mt-3 h-4 w-1/3 animate-pulse rounded bg-stone-100" />
      <div className="mt-8 space-y-2.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-3.5 animate-pulse rounded bg-stone-100" style={{ width: `${70 + ((i * 13) % 30)}%` }} />
        ))}
      </div>
    </div>
  );
}

async function ArticleBody({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getPost(slug);
  if (!p) notFound();

  // 阅读计数（失败不影响渲染）
  getPool()
    .query(`UPDATE blog_post SET read_count = read_count + 1 WHERE id=$1`, [p.id])
    .catch(() => {});

  const html = renderMarkdown(p.content);

  // 相关活动（内容 → 报名的转化）
  const related = await query<{
    id: string;
    title: string;
    location: string;
    start_at: string;
    guarantee_amount: number;
    capacity: number;
  }>(
    `SELECT a.id, a.title, a.location, a.start_at, a.guarantee_amount, a.capacity
       FROM blog_post_activity pa JOIN activity a ON a.id=pa.activity_id
      WHERE pa.post_id=$1 AND a.status='PUBLISHED' AND a.start_at > now()
      ORDER BY a.start_at ASC LIMIT 3`,
    [p.id]
  ).catch(() => []);

  // 同分类推荐
  const more = await query<{ slug: string; title: string; cover_emoji: string; summary: string }>(
    `SELECT p2.slug, p2.title, p2.cover_emoji, p2.summary
       FROM blog_post p2 JOIN blog_category c2 ON c2.id=p2.category_id
      WHERE c2.slug=$1 AND p2.id<>$2 AND p2.status='PUBLISHED'
      ORDER BY p2.published_at DESC LIMIT 3`,
    [p.category_slug, p.id]
  ).catch(() => []);

  // JSON-LD 结构化数据（让搜索结果带富摘要）
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: p.title,
    description: p.summary,
    datePublished: p.published_at,
    dateModified: p.updated_at,
    author: { '@type': 'Person', name: p.author_name },
    publisher: {
      '@type': 'Organization',
      name: '组局',
      url: SITE,
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE}/blog/${p.slug}` },
    keywords: p.tags?.join(','),
    articleSection: p.category_name,
  };

  const dt = new Date(p.published_at);
  const dateStr = `${dt.getFullYear()} 年 ${dt.getMonth() + 1} 月 ${dt.getDate()} 日`;

  return (
    <article className="mx-auto max-w-3xl px-5 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Link href="/blog" className="text-[12.5px] text-muted hover:text-ink">
        ← 返回博客
      </Link>

      <header className="mt-4">
        <div className="flex items-center gap-2">
          <Link
            href={`/blog?category=${p.category_slug}`}
            className="rounded-full bg-moss-50 px-2.5 py-1 text-[11.5px] font-medium text-moss-700 hover:bg-moss-100"
          >
            {p.category_name}
          </Link>
          <span className="text-[11.5px] text-stone-400">{p.read_count} 次阅读</span>
        </div>

        <h1 className="mt-3 text-[30px] font-semibold leading-[1.25] tracking-tight sm:text-[34px]">
          {p.title}
        </h1>

        <p className="mt-3 flex flex-wrap items-center gap-x-3 text-[12.5px] text-muted">
          <span className="text-ink">{p.author_name}</span>
          <span className="text-stone-300">·</span>
          <span>{dateStr}</span>
        </p>

        {p.summary && (
          <p className="mt-4 border-l-2 border-moss-300 pl-4 text-[14px] leading-relaxed text-stone-600">
            {p.summary}
          </p>
        )}
      </header>

      {/* 正文 */}
      <div className="blog-body mt-8" dangerouslySetInnerHTML={{ __html: html }} />

      {/* 标签 */}
      {p.tags?.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-1.5">
          {p.tags.map((t) => (
            <span key={t} className="rounded-full bg-stone-100 px-2.5 py-1 text-[11.5px] text-stone-600">
              #{t}
            </span>
          ))}
        </div>
      )}

      {/* 相关活动 */}
      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-[16px] font-semibold tracking-tight">文中提到的路线，正在组局</h2>
          <div className="space-y-2.5">
            {related.map((a) => (
              <Link
                key={a.id}
                href={`/activity/${a.id}`}
                className="card flex items-center gap-3 p-4 transition-colors hover:border-moss-300"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium">{a.title}</p>
                  <p className="mt-1 text-[12px] text-muted">
                    {a.location} · {new Date(a.start_at).toLocaleDateString('zh-CN')}
                  </p>
                </div>
                <span className="shrink-0 text-[12px] font-medium text-moss-700">
                  保证金 ¥{(a.guarantee_amount / 100).toFixed(0)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 更多文章 */}
      {more.length > 0 && (
        <section className="mt-10 border-t border-stone-200/70 pt-8">
          <h2 className="mb-3 text-[16px] font-semibold tracking-tight">同分类继续读</h2>
          <div className="space-y-2">
            {more.map((m) => (
              <Link
                key={m.slug}
                href={`/blog/${m.slug}`}
                className="flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-stone-50"
              >
                <span className="text-[18px]">{m.cover_emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium leading-snug">{m.title}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-muted">{m.summary}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 尾部转化 */}
      <div className="card mt-10 bg-moss-50/50 p-6 text-center">
        <p className="text-[15px] font-medium">想和文中那些人来一场真的？</p>
        <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-muted">
          保证金制组局：到场全额退还，爽约的钱分给来了的人。
        </p>
        <Link href="/" className="btn btn-primary mt-4 inline-block">
          看看近期组局
        </Link>
      </div>

      <p className="mt-8 text-[11px] leading-relaxed text-stone-400">
        免责声明：户外活动存在固有风险，本文经验仅供参考，请根据自身体能、天气与装备情况判断，
        必要时请雇佣专业向导。
      </p>
    </article>
  );
}
