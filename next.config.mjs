/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      // Placeholder imagery for hero / story / category tiles until Jeff
      // commissions the product shoot. Swapped in src/lib/placeholder-images.ts.
      { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
      // Real product images — migrated from BigCommerce. See NEXT_PUBLIC_BC_CDN_BASE.
      { protocol: 'https', hostname: 'cdn11.bigcommerce.com', pathname: '/s-u3ny6186xw/product_images/**' },
    ],
  },
};

export default nextConfig;
