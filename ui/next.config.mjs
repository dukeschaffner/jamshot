import path from 'path'
import { fileURLToPath } from 'url'
import { loadDevEnv } from '@sterio/dev-env'

loadDevEnv({ required: false })

const dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(dirname, '..'),
  reactStrictMode: false,
  transpilePackages: ['@sterio/subscription-utils'],
  typescript: {
    ignoreBuildErrors: true,
  },
  async redirects() {
    return [
      {
        source: '/guide-find-producer',
        destination: '/guides/find-producer',
        permanent: true,
      },
      {
        source: '/guide-long-distance-collab',
        destination: '/guides/long-distance-collab',
        permanent: true,
      },
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pub-0b5b4b5c33744ae8907300ffc31c99c9.r2.dev',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        pathname: '/cdn-cgi/local/r2/public/**',
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

export default nextConfig
