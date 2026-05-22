import { getPayloadClient } from '@/lib/payload/getPayloadClient'

export async function getMarketingPage(slug) {
  try {
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'pages',
      where: {
        and: [
          { slug: { equals: slug } },
          { status: { equals: 'published' } },
        ],
      },
      limit: 1,
    })

    return result.docs[0] || null
  } catch (error) {
    console.error(`Failed to load marketing page "${slug}":`, error)
    return null
  }
}

export async function getPublishedMarketingSlugs() {
  try {
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'pages',
      where: { status: { equals: 'published' } },
      limit: 100,
    })

    return result.docs.map((page) => page.slug)
  } catch (error) {
    console.error('Failed to load marketing page slugs:', error)
    return []
  }
}
