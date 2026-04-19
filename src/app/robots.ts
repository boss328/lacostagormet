import type { MetadataRoute } from 'next';

/**
 * /robots.txt — emitted by Next from this MetadataRoute.
 *
 * Disallows the private surfaces (admin / account / api / cart /
 * checkout). Everything else is open. Sitemap pointer uses the same
 * NEXT_PUBLIC_SITE_URL the sitemap route uses, kept in sync via the
 * shared env var.
 */

const SITE = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lacostagourmet.com'
).replace(/\/$/, '');

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/account', '/api', '/cart', '/checkout'],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
