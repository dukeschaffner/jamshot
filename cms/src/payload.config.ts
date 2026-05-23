import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Pages } from './collections/Pages'
import { Users } from './collections/Users'
import { seedMarketingPages } from './lib/marketing/seedMarketingPages'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  serverURL: process.env.SERVER_URL || '',
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Pages],
  onInit: async (payload) => {
    if (process.env.NODE_ENV === 'production' && process.env.SEED_MARKETING_ON_INIT !== 'true') {
      return
    }

    try {
      const result = await seedMarketingPages(payload)
      if (result.seeded) {
        console.info('[marketing-seed] Created initial CMS pages:', result.results?.map((entry) => entry.slug).join(', '))
      }
    } catch (error) {
      console.error('[marketing-seed] Failed to seed marketing pages on init:', error)
    }
  },
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  routes: {
    admin: '/cms',
  },
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.CMS_DATABASE_URL || '',
    },
  }),
  sharp,
})
