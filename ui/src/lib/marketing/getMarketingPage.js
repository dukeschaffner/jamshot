import { draftMode } from 'next/headers'

function getCmsUrl() {
  const explicit =
    process.env.CMS_URL ||
    process.env.NEXT_PUBLIC_CMS_URL

  if (explicit) {
    return explicit.replace(/\/$/, '')
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
  if (apiUrl.includes('/test/') || apiUrl.includes('test.sterio.fm')) {
    return 'https://test-cms.sterio.fm'
  }
  if (apiUrl.includes('api.sterio.fm')) {
    return 'https://cms.sterio.fm'
  }

  return 'http://localhost:3001'
}

function getCmsServerUrl() {
  return (
    process.env.CMS_URL ||
    process.env.NEXT_PUBLIC_CMS_URL ||
    getCmsUrl()
  ).replace(/\/$/, '')
}

async function fetchCmsCollection(collection, params, { preview = false } = {}) {
  const query = new URLSearchParams(params)
  const headers = {}

  if (preview && process.env.PREVIEW_SECRET) {
    headers['x-preview-secret'] = process.env.PREVIEW_SECRET
  }

  const response = await fetch(`${getCmsUrl()}/api/${collection}?${query}`, {
    headers,
    next: preview ? { revalidate: 0 } : { revalidate: 60 },
    cache: preview ? 'no-store' : undefined,
  })

  if (!response.ok) {
    throw new Error(`CMS request failed (${response.status})`)
  }

  return response.json()
}

export async function isPreviewMode() {
  const { isEnabled } = await draftMode()
  return isEnabled
}

export async function getMarketingPage(slug, options = {}) {
  const preview = options.preview ?? (await isPreviewMode())

  try {
    const params = {
      'where[slug][equals]': slug,
      limit: '1',
      depth: '2',
    }

    if (!preview) {
      params['where[status][equals]'] = 'published'
    }

    const result = await fetchCmsCollection('pages', params, { preview })
    return result.docs?.[0] || null
  } catch (error) {
    console.error(`Failed to load marketing page "${slug}":`, error)
    return null
  }
}

export async function getPublishedMarketingSlugs() {
  try {
    const result = await fetchCmsCollection('pages', {
      'where[status][equals]': 'published',
      limit: '100',
      depth: '0',
    })

    return (result.docs || []).map((page) => page.slug)
  } catch (error) {
    console.error('Failed to load marketing page slugs:', error)
    return []
  }
}

export { getCmsServerUrl }
