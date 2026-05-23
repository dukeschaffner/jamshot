function getCmsUrl() {
  return process.env.CMS_URL || 'http://localhost:3001'
}

async function fetchCmsCollection(collection, params) {
  const query = new URLSearchParams(params)
  const response = await fetch(`${getCmsUrl()}/api/${collection}?${query}`, {
    next: { revalidate: 60 },
  })

  if (!response.ok) {
    throw new Error(`CMS request failed (${response.status})`)
  }

  return response.json()
}

export async function getMarketingPage(slug) {
  try {
    const result = await fetchCmsCollection('pages', {
      'where[slug][equals]': slug,
      'where[status][equals]': 'published',
      limit: '1',
      depth: '2',
    })

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
