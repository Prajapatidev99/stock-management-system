/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api',
  },
  webpack(config, { isServer }) {
    config.resolve.alias['@'] = path.resolve(__dirname, 'src');

    // Stub out heavy unused jspdf dependencies unconditionally for both client and server builds.
    // canvg, html2canvas, and dompurify pull in hundreds of core-js polyfills and canvas dependencies.
    config.resolve.alias['canvg'] = false;
    config.resolve.alias['html2canvas'] = false;
    config.resolve.alias['dompurify'] = false;

    return config;
  },
  async redirects() {
    return [
      {
        source: '/dashboard',
        destination: '/',
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
