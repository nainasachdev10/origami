/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000'] },
  },
  transpilePackages: ['@origami/shared'],
  typescript: {
    ignoreBuildErrors: true,
  },
}
module.exports = nextConfig
