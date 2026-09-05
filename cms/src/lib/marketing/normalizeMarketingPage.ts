import { textToRichText } from './lexicalSeed.js'

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

export function normalizeMarketingPage(page: Record<string, unknown>): Record<string, unknown> {
  return {
    ...page,
    layout: Array.isArray(page.layout) ? normalizeMarketingLayout(page.layout) : page.layout,
  }
}
