import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
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
