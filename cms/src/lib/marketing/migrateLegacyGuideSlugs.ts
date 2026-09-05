import type { Payload } from 'payload'

/** Flat guide slugs → nested /guides/... paths. */
export const LEGACY_GUIDE_SLUGS: Record<string, string> = {
  'guide-find-producer': 'guides/find-producer',
  'guide-long-distance-collab': 'guides/long-distance-collab',
}

const LEGACY_PATH_REPLACEMENTS: Array<[string, string]> = Object.entries(LEGACY_GUIDE_SLUGS).map(
  ([oldSlug, newSlug]) => [`/${oldSlug}`, `/${newSlug}`],
)

async function findPageBySlug(payload: Payload, slug: string) {
  const result = await payload.find({
    collection: 'pages',
    where: { slug: { equals: slug } },
    limit: 1,
  })
  return result.docs[0] || null
}

function replaceLegacyPathsInString(value: string) {
  let next = value
  for (const [from, to] of LEGACY_PATH_REPLACEMENTS) {
    next = next.split(from).join(to)
  }
  return next
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
 * Renames legacy flat guide slugs and rewrites old href/canonical strings in place.
 * Does not replace page content with seed data.
 */
export async function migrateLegacyGuideSlugs(payload: Payload) {
  const results: Array<{ from?: string; to?: string; slug?: string; action: string }> = []

  for (const [oldSlug, newSlug] of Object.entries(LEGACY_GUIDE_SLUGS)) {
    const oldPage = await findPageBySlug(payload, oldSlug)
    if (!oldPage) continue

    const existingNewPage = await findPageBySlug(payload, newSlug)
    const rewrittenLayout = rewriteLegacyPaths(oldPage.layout)
    const rewrittenSeo = rewriteLegacyPaths(oldPage.seo)

    if (existingNewPage) {
      // Prefer keeping whichever page already has the new slug; drop the legacy duplicate.
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

  // Patch remaining old guide links on any existing pages (e.g. /guides index cards).
  const pages = await payload.find({
    collection: 'pages',
    limit: 100,
    depth: 0,
  })

  for (const page of pages.docs) {
    if (typeof page.slug === 'string' && page.slug in LEGACY_GUIDE_SLUGS) {
      // Still being handled / already handled above.
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
