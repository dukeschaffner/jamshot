import path from 'path'
import { fileURLToPath } from 'url'
import { withPayload } from '@payloadcms/next/withPayload'

const dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(dirname, '..'),
  reactStrictMode: false,
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default withPayload(nextConfig)
