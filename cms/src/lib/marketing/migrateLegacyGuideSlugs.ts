import type { Payload } from 'payload'

const LEGACY_GUIDE_SLUG_PREFIX = 'guide-'

export function nestedGuideSlugFromLegacy(slug: string) {
  if (!slug.startsWith(LEGACY_GUIDE_SLUG_PREFIX)) return null
  return `guides/${slug.slice(LEGACY_GUIDE_SLUG_PREFIX.length)}`
}

async function findPageBySlug(payload: Payload, slug: string) {
  const result = await payload.find({
    collection: 'pages',
    where: { slug: { equals: slug } },
    limit: 1,
  })
  return result.docs[0] || null
}

/** `/guide-foo` → `/guides/foo` (and same inside absolute URLs). */
function replaceLegacyPathsInString(value: string) {
  return value.split(`/${LEGACY_GUIDE_SLUG_PREFIX}`).join('/guides/')
}

/** Deep-walk JSON-like values and rewrite legacy guide paths in strings only. */
function rewriteLegacyPaths(value: unknown): { value: unknown; changed: boolean } {
  if (typeof value === 'string') {
    const next = replaceLegacyPathsInString(value)
    return { value: next, changed: next !== value }
  }

  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item) => {
      const rewritten = rewriteLegacyPaths(item)
      changed = changed || rewritten.changed
      return rewritten.value
    })
    return { value: next, changed }
  }

  if (value && typeof value === 'object') {
    let changed = false
    const next: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const rewritten = rewriteLegacyPaths(child)
      changed = changed || rewritten.changed
      next[key] = rewritten.value
    }
    return { value: next, changed }
  }

  return { value, changed: false }
}

/**
 * Renames every legacy `guide-*` page to `guides/...` and rewrites old href/canonical
 * strings in place. Does not replace page content with seed data.
 */
export async function migrateLegacyGuideSlugs(payload: Payload) {
  const results: Array<{ from?: string; to?: string; slug?: string; action: string }> = []

  const pages = await payload.find({
    collection: 'pages',
    limit: 100,
    depth: 0,
  })

  const legacyPages = pages.docs.filter(
    (page) => typeof page.slug === 'string' && page.slug.startsWith(LEGACY_GUIDE_SLUG_PREFIX),
  )

  for (const oldPage of legacyPages) {
    const oldSlug = oldPage.slug as string
    const newSlug = nestedGuideSlugFromLegacy(oldSlug)
    if (!newSlug) continue

    const existingNewPage = await findPageBySlug(payload, newSlug)
    const rewrittenLayout = rewriteLegacyPaths(oldPage.layout)
    const rewrittenSeo = rewriteLegacyPaths(oldPage.seo)

    if (existingNewPage) {
      await payload.delete({
        collection: 'pages',
        id: oldPage.id,
      })
      results.push({ from: oldSlug, to: newSlug, action: 'deleted-legacy-duplicate' })
      continue
    }

    await payload.update({
      collection: 'pages',
      id: oldPage.id,
      data: {
        slug: newSlug,
        ...(rewrittenLayout.changed ? { layout: rewrittenLayout.value } : {}),
        ...(rewrittenSeo.changed ? { seo: rewrittenSeo.value } : {}),
      } as never,
    })
    results.push({
      from: oldSlug,
      to: newSlug,
      action: rewrittenLayout.changed || rewrittenSeo.changed ? 'renamed-and-rewrote-urls' : 'renamed',
    })
  }

  // Re-fetch so link rewrites see post-rename docs (e.g. /guides index cards).
  const pagesAfterRename = await payload.find({
    collection: 'pages',
    limit: 100,
    depth: 0,
  })

  for (const page of pagesAfterRename.docs) {
    if (typeof page.slug === 'string' && page.slug.startsWith(LEGACY_GUIDE_SLUG_PREFIX)) {
      continue
    }

    const rewrittenLayout = rewriteLegacyPaths(page.layout)
    const rewrittenSeo = rewriteLegacyPaths(page.seo)
    if (!rewrittenLayout.changed && !rewrittenSeo.changed) continue

    await payload.update({
      collection: 'pages',
      id: page.id,
      data: {
        ...(rewrittenLayout.changed ? { layout: rewrittenLayout.value } : {}),
        ...(rewrittenSeo.changed ? { seo: rewrittenSeo.value } : {}),
      } as never,
    })
    results.push({ slug: String(page.slug), action: 'rewrote-urls' })
  }

  return results
}
