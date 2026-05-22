import path from 'path'
import { fileURLToPath } from 'url'
import { withPayload } from '@payloadcms/next/withPayload'

const dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Hoisted deps live in the monorepo root; required for a correct standalone trace.
  outputFileTracingRoot: path.join(dirname, '..'),
  reactStrictMode: false,
  transpilePackages: ['@sterio/subscription-utils'],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pub-0b5b4b5c33744ae8907300ffc31c99c9.r2.dev',
      },
      {
        protocol: 'https',
        hostname: 'cdn-test.sterio.fm',
      },
      {
        protocol: 'https',
        hostname: 'cdn.sterio.fm',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
}

export default withPayload(nextConfig)
