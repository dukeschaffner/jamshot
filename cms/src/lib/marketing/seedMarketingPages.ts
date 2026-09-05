import type { Payload } from 'payload'

import { marketingPages } from './marketingPageSeedData.js'
import { migrateLegacyGuideSlugs } from './migrateLegacyGuideSlugs'
import { normalizeMarketingPage } from './normalizeMarketingPage'

export async function seedMarketingPages(payload: Payload, { force = false } = {}) {
  const migrations = await migrateLegacyGuideSlugs(payload)

  if (!force) {
    const existing = await payload.find({
      collection: 'pages',
      limit: 1,
    })

    if (existing.totalDocs > 0) {
      return {
        seeded: false,
        reason: 'Pages already exist',
        migrations,
      }
    }
  }

  const results = []

  for (const page of marketingPages) {
    const normalizedPage = normalizeMarketingPage(page as Record<string, unknown>)
    const slug = normalizedPage.slug as string
    const existing = await payload.find({
      collection: 'pages',
      where: { slug: { equals: slug } },
      limit: 1,
    })

    if (existing.docs[0]) {
      await payload.update({
        collection: 'pages',
        id: existing.docs[0].id,
        data: normalizedPage as never,
      })
      results.push({ slug, action: 'updated' })
      continue
    }

    await payload.create({
      collection: 'pages',
      data: normalizedPage as never,
    })
    results.push({ slug, action: 'created' })
  }

  return { seeded: true, results, migrations }
}
