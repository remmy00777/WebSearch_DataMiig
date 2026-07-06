/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { serverComponentsExternalPackages: ['bullmq', 'ioredis'] }
};
module.exports = nextConfig;
