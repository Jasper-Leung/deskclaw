/**
 * Next.js Configuration
 *
 * Optimized configuration for DeskClaw Electron app
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Output configuration for Electron
  // Only use standalone in production
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
  distDir: '.next',

  // Disable server-side features for Electron
  images: {
    unoptimized: true,
    domains: [],
    remotePatterns: [],
  },

  // Production optimization for Electron
  productionBrowserSourceMaps: false,

  // Fix multiple lockfiles warning
  outputFileTracingRoot: '../',

  // Skip static generation for error pages
  skipTrailingSlashRedirect: true,
  skipMiddlewareUrlNormalize: true,

  // Environment variables
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version || '0.1.0',
  },

  // Optimize for Electron
  webpack: (config, { dev }) => {
    // Electron support
    config.externals = ['electron', ...config.externals];

    // Add aliases for cleaner imports
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': require('path').resolve(__dirname, './'),
      '@components': require('path').resolve(__dirname, './components'),
      '@lib': require('path').resolve(__dirname, './lib'),
      '@app': require('path').resolve(__dirname, './app'),
      '@shared': require('path').resolve(__dirname, '../shared'),
    };

    // Speed up webpack in development
    if (dev) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      };
    }

    return config;
  },

  // Performance optimizations
  compress: true,
  poweredByHeader: false,

  // ESLint and TypeScript checks enabled for production builds
  eslint: {
    ignoreDuringBuilds: false,
  },

  typescript: {
    ignoreBuildErrors: false,
  },

  // Experimental features
  experimental: {
    optimizeCss: false,
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },

  // Headers for security
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
