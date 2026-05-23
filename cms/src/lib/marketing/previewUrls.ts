function getFrontendUrl() {
  return (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '')
}

export function pathFromSlug(slug: string) {
  return slug === 'home' ? '/' : `/${slug}`
}

export function getPublishedPageUrl(slug: string) {
  return `${getFrontendUrl()}${pathFromSlug(slug)}`
}

export function getDraftPreviewUrl(slug: string) {
  const params = new URLSearchParams({
    slug,
    path: pathFromSlug(slug),
    previewSecret: process.env.PREVIEW_SECRET || '',
  })

  return `${getFrontendUrl()}/api/preview?${params.toString()}`
}
