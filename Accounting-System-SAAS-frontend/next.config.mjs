import os from 'os';

const interfaces = os.networkInterfaces();
const getNetworkAddress = () => {
  for (const name of Object.keys(interfaces)) {
    for (const netInterface of interfaces[name]) {
      const {address, family, internal} = netInterface;
      if (family === 'IPv4' && !internal) {
        return address;
      }
    }
  }
};

if (process.env.NODE_ENV !== 'production') {
  const ip = getNetworkAddress();
  if (ip) {
    console.log(`\n> Network: \x1b[36mhttp://${ip}:3000\x1b[0m\n`);
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Enable gzip/brotli compression for all responses
  compress: true,
  env: {
    VITE_ENABLE_MENU_PERMISSIONS: process.env.VITE_ENABLE_MENU_PERMISSIONS,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      // Security headers for all routes
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
      // Long-lived cache for hashed Next.js static assets (_next/static)
      {
        source: '/_next/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // Do not cache HTML/RSC documents: stale shell keeps pointing at old _next/static chunks.
      // private + no-store avoids shared proxies/CDNs serving another user's cached page.
      {
        source: '/((?!_next/static).*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-cache, no-store, max-age=0, must-revalidate',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
