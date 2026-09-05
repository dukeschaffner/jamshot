import { postgresAdapter } from '@payloadcms/db-postgres'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Pages } from './collections/Pages'
import { Users } from './collections/Users'
import { marketingLexicalEditor } from './lib/marketing/marketingLexicalEditor'
import { migrateLegacyGuideSlugs } from './lib/marketing/migrateLegacyGuideSlugs'
import { seedMarketingPages } from './lib/marketing/seedMarketingPages'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  serverURL: process.env.SERVER_URL || '',
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
      importMapFile: path.resolve(dirname, 'app/cms/importMap.js'),
    },
  },
  collections: [Users, Pages],
  onInit: async (payload) => {
    const canSeed =
      process.env.NODE_ENV !== 'production' || process.env.SEED_MARKETING_ON_INIT === 'true'

    try {
      if (canSeed) {
        const result = await seedMarketingPages(payload)
        if (result.migrations && result.migrations.length > 0) {
          console.info(
            '[marketing-seed] Migrated guide slugs:',
            result.migrations
              .map((entry) =>
                entry.from
                  ? `${entry.from} → ${entry.to} (${entry.action})`
                  : `${entry.slug} (${entry.action})`,
              )
              .join(', '),
          )
        }
        if (result.seeded) {
          console.info(
            '[marketing-seed] Created initial CMS pages:',
            result.results?.map((entry) => entry.slug).join(', '),
          )
        }
      } else {
        const migrations = await migrateLegacyGuideSlugs(payload)
        if (migrations.length > 0) {
          console.info(
            '[marketing-seed] Migrated guide slugs:',
            migrations
              .map((entry) =>
                entry.from
                  ? `${entry.from} → ${entry.to} (${entry.action})`
                  : `${entry.slug} (${entry.action})`,
              )
              .join(', '),
          )
        }
      }
    } catch (error) {
      console.error('[marketing-seed] Failed to seed or migrate marketing pages on init:', error)
    }
  },
  editor: marketingLexicalEditor,
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
