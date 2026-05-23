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
  // Payload pulls in pino; Turbopack externalizes it but thread-stream was missing from Lambda traces.
  serverExternalPackages: ['pino-pretty', 'pino-abstract-transport'],
  outputFileTracingIncludes: {
    '**/*': [
      './node_modules/thread-stream/index.js',
      './node_modules/thread-stream/lib/**/*',
      './node_modules/thread-stream/package.json',
      './node_modules/pino/**/*',
      './node_modules/pino-abstract-transport/**/*',
      './node_modules/@pinojs/redact/**/*',
      './node_modules/payload/node_modules/thread-stream/index.js',
      './node_modules/payload/node_modules/thread-stream/lib/**/*',
      './node_modules/payload/node_modules/thread-stream/package.json',
      './node_modules/payload/node_modules/pino/**/*',
    ],
  },
}

export default withPayload(nextConfig)
