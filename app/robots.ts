import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin/', '/auth', '/me', '/host'],
      },
    ],
    sitemap: 'https://uismile.com/sitemap.xml',
    host: 'https://uismile.com',
  };
}
