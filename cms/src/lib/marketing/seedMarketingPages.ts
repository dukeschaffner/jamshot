import type { Payload } from 'payload'
import { textToRichText } from './lexicalSeed.js'
import { marketingPages } from './marketingPageSeedData.js'

function normalizeRichTextValue(value: unknown) {
  if (value == null) return value
  if (typeof value === 'string') return textToRichText(value)
  if (typeof value === 'object' && value !== null && 'root' in value) return value
  return value
}

function normalizeMarketingLayout(layout: unknown[]) {
  return layout.map((block) => {
    if (!block || typeof block !== 'object' || !('blockType' in block)) {
      return block
    }

    const typedBlock = block as Record<string, unknown>

    if (typedBlock.blockType === 'articleHeader') {
      return {
        ...typedBlock,
        intro: normalizeRichTextValue(typedBlock.intro),
      }
    }

    if (typedBlock.blockType === 'story') {
      const paragraphs = Array.isArray(typedBlock.paragraphs)
        ? typedBlock.paragraphs.map((paragraph) => {
            if (!paragraph || typeof paragraph !== 'object') return paragraph
            const typedParagraph = paragraph as Record<string, unknown>
            return {
              ...typedParagraph,
              text: normalizeRichTextValue(typedParagraph.text),
            }
          })
        : typedBlock.paragraphs

      return { ...typedBlock, paragraphs }
    }

    if (typedBlock.blockType === 'articleSections') {
      const sections = Array.isArray(typedBlock.sections)
        ? typedBlock.sections.map((section) => {
            if (!section || typeof section !== 'object') return section
            const typedSection = section as Record<string, unknown>
            if (typedSection.type === 'heading') return typedSection

            return {
              ...typedSection,
              text: normalizeRichTextValue(typedSection.text),
            }
          })
        : typedBlock.sections

      return { ...typedBlock, sections }
    }

    return typedBlock
  })
}

function normalizeMarketingPage(page: Record<string, unknown>): Record<string, unknown> {
  return {
    ...page,
    layout: Array.isArray(page.layout) ? normalizeMarketingLayout(page.layout) : page.layout,
  }
}

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

  return { seeded: true, results }
}
