import type { CollectionConfig } from 'payload'

import { marketingBlocks } from './blocks/marketingBlocks'

export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'status', 'updatedAt'],
    description: 'Marketing and SEO pages for sterio.fm.',
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description: 'URL path segment, e.g. "home", "about", or "guide-find-producer".',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
      ],
    },
    {
      type: 'group',
      name: 'seo',
      label: 'SEO',
      fields: [
        {
          name: 'metaTitle',
          type: 'text',
          admin: {
            description: 'Browser tab and search result title. Falls back to page title.',
          },
        },
        {
          name: 'metaDescription',
          type: 'textarea',
        },
        {
          name: 'ogImage',
          type: 'text',
          admin: {
            description: 'Absolute URL or site path (e.g. /marketing/duke-pfp.jpg).',
          },
        },
        {
          name: 'ogImageAlt',
          type: 'text',
        },
        {
          name: 'noIndex',
          type: 'checkbox',
          defaultValue: false,
        },
        {
          name: 'structuredData',
          type: 'json',
          admin: {
            description: 'Optional JSON-LD object or array for schema.org markup.',
          },
        },
      ],
    },
    {
      name: 'layout',
      type: 'blocks',
      required: true,
      blocks: marketingBlocks,
    },
  ],
}
