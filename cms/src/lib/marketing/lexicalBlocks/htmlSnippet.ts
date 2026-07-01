import type { Block } from 'payload'

export const htmlSnippetBlock: Block = {
  slug: 'htmlSnippet',
  interfaceName: 'HtmlSnippetBlock',
  labels: {
    singular: 'HTML Snippet',
    plural: 'HTML Snippets',
  },
  fields: [
    {
      name: 'html',
      type: 'code',
      required: true,
      admin: {
        language: 'html',
        description:
          'Paste trusted embed HTML (charts, iframes, scripts from known providers). Only use code from sources you trust.',
      },
    },
    {
      name: 'caption',
      type: 'text',
      admin: {
        description: 'Optional caption shown below the embed.',
      },
    },
  ],
}
