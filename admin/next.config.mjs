import path from 'path'
import { fileURLToPath } from 'url'
import { loadDevEnv } from '@sterio/dev-env'

loadDevEnv({ required: false })

const dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(dirname, '..'),
  reactStrictMode: true,
}

export default nextConfig
