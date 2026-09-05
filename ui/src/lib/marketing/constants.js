export const MARKETING_ROUTE_SLUGS = [
  'about',
  'guides',
  'plugin',
]

export const DEDICATED_MARKETING_PATHS = [
  '/about',
  '/guides',
  '/plugin',
]

/** Routes that always render CMS marketing pages, regardless of auth. */
export function isDedicatedMarketingPath(pathname) {
  if (!pathname) return false
  return DEDICATED_MARKETING_PATHS.includes(pathname) || pathname.startsWith('/guides/')
}

/** All public marketing URLs, including the smart-routed homepage. */
export function isMarketingPath(pathname) {
  if (!pathname) return false
  return pathname === '/' || isDedicatedMarketingPath(pathname)
}

export function slugFromMarketingPath(pathname) {
  if (pathname === '/') return 'home'
  return pathname.replace(/^\//, '')
}

export function pathFromSlug(slug) {
  if (slug === 'home') return '/'
  return `/${slug}`
}

export const MARKETING_NAV = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/guides', label: 'Guides' },
  { href: '/plugin', label: 'Plugin' },
]

export const MARKETING_FOOTER = [
  ...MARKETING_NAV,
  { href: '/feed', label: 'Browse Tracks' },
  { href: '/contact', label: 'Contact' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms of Service' },
]

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://sterio.fm'

export function resolveMarketingAsset(path) {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return path.startsWith('/') ? path : `/${path}`
}

export function buildPageMetadata(page, slug) {
  const title = page?.seo?.metaTitle || page?.title
  const description = page?.seo?.metaDescription || ''
  const ogImage = resolveMarketingAsset(page?.seo?.ogImage || '/marketing/duke-pfp.jpg')
  const canonical = slug === 'home' ? SITE_URL : `${SITE_URL}/${slug}`

  return {
    title,
    description,
    alternates: { canonical },
    robots: page?.seo?.noIndex ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: 'Sterio',
      type: 'website',
      images: ogImage
        ? [{ url: ogImage.startsWith('http') ? ogImage : `${SITE_URL}${ogImage}`, alt: page?.seo?.ogImageAlt || title }]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ogImage
        ? [ogImage.startsWith('http') ? ogImage : `${SITE_URL}${ogImage}`]
        : undefined,
    },
  }
}
