import type { MetadataRoute } from 'next';
import { query } from '@/lib/db';

const SITE = 'https://uismile.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE}/blog`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE}/circle`, changeFrequency: 'daily', priority: 0.7 },
  ];

  const [posts, acts] = await Promise.all([
    query<{ slug: string; updated_at: Date }>(
      `SELECT slug, updated_at FROM blog_post
        WHERE status='PUBLISHED' AND published_at <= now()
        ORDER BY published_at DESC LIMIT 500`,
      []
    ).catch(() => []),
    query<{ id: string; updated_at: Date }>(
      `SELECT id, updated_at FROM activity WHERE status='PUBLISHED' LIMIT 500`,
      []
    ).catch(() => []),
  ]);

  return [
    ...staticPages,
    ...posts.map((p) => ({
      url: `${SITE}/blog/${p.slug}`,
      lastModified: p.updated_at,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...acts.map((a) => ({
      url: `${SITE}/activity/${a.id}`,
      lastModified: a.updated_at,
      changeFrequency: 'daily' as const,
      priority: 0.6,
    })),
  ];
}
