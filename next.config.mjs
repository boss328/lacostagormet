import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const ONE_YEAR = 60 * 60 * 24 * 365;
const ONE_HOUR = 60 * 60;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vercel handles compression at the edge already, but enabling here
  // makes self-hosted dev / preview environments behave the same.
  compress: true,
  poweredByHeader: false,

  images: {
    // AVIF first, then WebP — Next picks the smallest format the
    // browser accepts via the Accept header.
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      // Placeholder imagery for hero / story / category tiles until Jeff
      // commissions the product shoot. Swapped in src/lib/placeholder-images.ts.
      { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
      // Real product images migrated from BigCommerce v3 export.
      // URL shape: /s-u3ny6186xw/products/<PID>/images/<IID>/<file>.<TS>.<W>.<H>.<ext>
      { protocol: 'https', hostname: 'cdn11.bigcommerce.com', pathname: '/s-u3ny6186xw/products/**' },
    ],
  },

  async headers() {
    return [
      // Brand assets (logo, favicon, hand-lettered art) — content-addressed
      // by filename, can cache aggressively. Bumping the logo means changing
      // the import path or the file content, both of which Next fingerprints
      // anyway via /_next/image.
      {
        source: '/brand/:path*',
        headers: [
          { key: 'Cache-Control', value: `public, max-age=${ONE_YEAR}, immutable` },
        ],
      },
      // Self-hosted fonts (none today — next/font/google handles its own
      // long-cache via /_next/static — but if Phase 8 adds /public/fonts
      // we want them on the same lane).
      {
        source: '/fonts/:path*',
        headers: [
          { key: 'Cache-Control', value: `public, max-age=${ONE_YEAR}, immutable` },
        ],
      },
      // Next bundles its own static assets under /_next/static and emits a
      // long-immutable header by default — listing it here keeps the contract
      // explicit and survives any future config drift.
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: `public, max-age=${ONE_YEAR}, immutable` },
        ],
      },
      // The favicon at /favicon.ico — short cache because we may iterate.
      {
        source: '/favicon.ico',
        headers: [
          { key: 'Cache-Control', value: `public, max-age=${ONE_HOUR}` },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
