import type { Payload } from 'payload'
import { marketingPages } from './marketingPageSeedData.js'

export async function seedMarketingPages(payload: Payload, { force = false } = {}) {
  if (!force) {
    const existing = await payload.find({
      collection: 'pages',
      limit: 1,
    })

    if (existing.totalDocs > 0) {
      return { seeded: false, reason: 'Pages already exist' }
    }
  }

  const results = []

  for (const page of marketingPages) {
    const existing = await payload.find({
      collection: 'pages',
      where: { slug: { equals: page.slug } },
      limit: 1,
    })

    if (existing.docs[0]) {
      await payload.update({
        collection: 'pages',
        id: existing.docs[0].id,
        data: page,
      })
      results.push({ slug: page.slug, action: 'updated' })
      continue
    }

    await payload.create({
      collection: 'pages',
      data: page,
    })
    results.push({ slug: page.slug, action: 'created' })
  }

  return { seeded: true, results }
}
