import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { query } from '@/lib/db';

export const metadata: Metadata = {
  title: '户外博客 · 路线攻略与装备知识 | 组局',
  description:
    '白领户外组局平台的博客：新手路线攻略、装备真实评测、野外安全知识、体能训练方法。用经验换你少走弯路。',
  keywords: ['户外博客', '徒步攻略', '装备评测', '露营知识', '户外安全', '白领户外', '北京徒步'],
  alternates: { canonical: 'https://uismile.com/blog' },
  openGraph: {
    title: '户外博客 · 路线攻略与装备知识',
    description: '新手路线攻略、装备真实评测、野外安全知识、体能训练方法。',
    type: 'website',
    url: 'https://uismile.com/blog',
  },
};

interface Post {
  id: string;
  slug: string;
  title: string;
  summary: string;
  cover_emoji: string;
  tags: string[];
  is_featured: boolean;
  read_count: number;
  published_at: string;
  category_name: string;
  category_slug: string;
  author_name: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  post_count: number;
}

function fmtDate(d: string): string {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
    dt.getDate()
  ).padStart(2, '0')}`;
}

export default function BlogIndex({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  return (
    <Suspense fallback={<BlogSkeleton />}>
      <BlogList searchParams={searchParams} />
    </Suspense>
  );
}

function BlogSkeleton() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <div className="h-3 w-32 animate-pulse rounded bg-stone-100" />
      <div className="mt-4 h-9 w-2/3 animate-pulse rounded bg-stone-100" />
      <div className="mt-3 h-4 w-1/2 animate-pulse rounded bg-stone-100" />
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card h-36 animate-pulse bg-stone-50" />
        ))}
      </div>
    </div>
  );
}

async function BlogList({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const sp = await searchParams;
  const cat = sp.category ?? null;

  const [posts, cats] = await Promise.all([
    query<Post>(
      `SELECT p.id, p.slug, p.title, p.summary, p.cover_emoji, p.tags, p.is_featured,
              p.read_count, p.published_at,
              c.name AS category_name, c.slug AS category_slug, u.nickname AS author_name
         FROM blog_post p
         JOIN blog_category c ON c.id=p.category_id
         JOIN app_user u ON u.id=p.author_id
        WHERE p.status='PUBLISHED' AND p.published_at IS NOT NULL AND p.published_at <= now()
          AND ($1::text IS NULL OR c.slug=$1)
        ORDER BY p.is_featured DESC, p.published_at DESC
        LIMIT 30`,
      [cat]
    ).catch(() => []),
    query<Category>(
      `SELECT c.id, c.name, c.slug, c.description,
              (SELECT count(*) FROM blog_post p
                WHERE p.category_id=c.id AND p.status='PUBLISHED')::int AS post_count
         FROM blog_category c ORDER BY c.sort_no`,
      []
    ).catch(() => []),
  ]);

  const featured = posts.find((p) => p.is_featured) ?? posts[0];
  const rest = posts.filter((p) => p.id !== featured?.id);

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      {/* 头部 */}
      <header className="border-b border-stone-200/70 pb-8">
        <p className="text-[11.5px] font-medium uppercase tracking-[0.18em] text-moss-600">
          OUTDOOR JOURNAL
        </p>
        <h1 className="mt-2.5 text-[32px] font-semibold leading-tight tracking-tight sm:text-[38px]">
          走出去之前，
          <br className="sm:hidden" />
          先读点真话
        </h1>
        <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-muted">
          这里没有打卡滤镜。只有走过的人告诉你：哪段路难、哪双鞋值、几点出发最省力。
          读完再出门，少走弯路，也少受伤。
        </p>
      </header>

      {/* 分类 */}
      <nav className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/blog"
          className={`rounded-full border px-3.5 py-1.5 text-[12.5px] transition-colors ${
            !cat
              ? 'border-moss-600 bg-moss-600 text-white'
              : 'border-stone-200 bg-white text-stone-600 hover:border-moss-300'
          }`}
        >
          全部
        </Link>
        {cats.map((c) => (
          <Link
            key={c.id}
            href={`/blog?category=${c.slug}`}
            className={`rounded-full border px-3.5 py-1.5 text-[12.5px] transition-colors ${
              cat === c.slug
                ? 'border-moss-600 bg-moss-600 text-white'
                : 'border-stone-200 bg-white text-stone-600 hover:border-moss-300'
            }`}
          >
            {c.name}
            <span className="ml-1 opacity-60">{c.post_count}</span>
          </Link>
        ))}
      </nav>

      {/* 空态 */}
      {posts.length === 0 && (
        <div className="card mt-8 p-12 text-center">
          <p className="text-[15px] text-muted">这个分类下还没有文章</p>
          <p className="mt-1.5 text-[12.5px] text-stone-400">我们正在写，先去看看正在招募的组局？</p>
          <Link href="/" className="btn btn-primary mt-4 inline-block">
            浏览组局
          </Link>
        </div>
      )}

      {/* 头条 */}
      {featured && (
        <Link
          href={`/blog/${featured.slug}`}
          className="card group mt-8 block overflow-hidden transition-all hover:border-moss-300 hover:shadow-[0_10px_40px_-24px_rgba(31,52,29,0.5)]"
        >
          <div
            className="flex h-[150px] items-end justify-between px-6 pb-4"
            style={{ background: 'linear-gradient(135deg,#E9F4E8 0%,#CFE7C9 100%)' }}
          >
            <span className="text-[42px] leading-none">{featured.cover_emoji}</span>
            <span className="rounded-full bg-white/60 px-2.5 py-1 text-[11px] font-medium text-moss-700 backdrop-blur-sm">
              置顶 · {featured.category_name}
            </span>
          </div>
          <div className="p-6">
            <h2 className="text-[21px] font-semibold leading-snug tracking-tight group-hover:text-moss-700">
              {featured.title}
            </h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{featured.summary}</p>
            <p className="mt-3.5 flex flex-wrap items-center gap-x-3 text-[11.5px] text-stone-400">
              <span>{featured.author_name}</span>
              <span>{fmtDate(featured.published_at)}</span>
              <span>{featured.read_count} 次阅读</span>
              {featured.tags?.slice(0, 3).map((t) => (
                <span key={t} className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-500">
                  #{t}
                </span>
              ))}
            </p>
          </div>
        </Link>
      )}

      {/* 列表 */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {rest.map((p) => (
          <Link
            key={p.id}
            href={`/blog/${p.slug}`}
            className="card group flex flex-col p-5 transition-all hover:-translate-y-0.5 hover:border-moss-300 hover:shadow-[0_6px_24px_-14px_rgba(31,52,29,0.35)]"
          >
            <div className="flex items-start gap-3">
              <span className="text-[22px] leading-none">{p.cover_emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-moss-600">{p.category_name}</p>
                <h3 className="mt-0.5 text-[15px] font-semibold leading-snug tracking-tight group-hover:text-moss-700">
                  {p.title}
                </h3>
              </div>
            </div>
            <p className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-muted">
              {p.summary}
            </p>
            <p className="mt-auto flex items-center gap-2 pt-3 text-[11px] text-stone-400">
              <span>{fmtDate(p.published_at)}</span>
              <span>·</span>
              <span>{p.read_count} 阅读</span>
            </p>
          </Link>
        ))}
      </div>

      {/* 转化引导 */}
      <div className="card mt-10 bg-moss-50/50 p-6 text-center">
        <p className="text-[15px] font-medium">读完了，想真的走一趟？</p>
        <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-muted">
          平台上正在招募的组局都由真实用户发起，保证金制——到场全额退还，爽约的钱分给来了的人。
          这样约出来的人，才真的会来。
        </p>
        <Link href="/" className="btn btn-primary mt-4 inline-block">
          看看近期的组局
        </Link>
      </div>
    </div>
  );
}
