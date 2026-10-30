import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.AUTH_URL || 'https://gate-sathi.netlify.app';
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/privacy'],
      disallow: ['/app', '/gate', '/dashboard', '/students', '/admin', '/api'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
