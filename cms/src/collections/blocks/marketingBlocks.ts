import type { Block } from 'payload'

const linkFields = [
  {
    name: 'label',
    type: 'text' as const,
    required: true,
  },
  {
    name: 'href',
    type: 'text' as const,
    required: true,
    admin: {
      description: 'Relative path (e.g. /register) or full URL.',
    },
  },
]

export const marketingBlocks: Block[] = [
  {
    slug: 'hero',
    labels: { singular: 'Home Hero', plural: 'Home Heroes' },
    fields: [
      { name: 'eyebrow', type: 'text' },
      { name: 'headline', type: 'text', required: true },
      { name: 'subhead', type: 'textarea' },
      {
        name: 'actions',
        type: 'array',
        maxRows: 2,
        fields: [
          ...linkFields,
          {
            name: 'variant',
            type: 'select',
            defaultValue: 'primary',
            options: [
              { label: 'Primary', value: 'primary' },
              { label: 'Secondary', value: 'secondary' },
            ],
          },
        ],
      },
      {
        name: 'stats',
        type: 'array',
        fields: [
          { name: 'highlight', type: 'text', required: true },
          { name: 'label', type: 'text', required: true },
        ],
      },
      {
        name: 'showPhoneMock',
        type: 'checkbox',
        defaultValue: true,
      },
    ],
  },
  {
    slug: 'pageHero',
    labels: { singular: 'Page Hero', plural: 'Page Heroes' },
    fields: [
      { name: 'eyebrow', type: 'text' },
      { name: 'headline', type: 'text', required: true },
      { name: 'subhead', type: 'textarea' },
    ],
  },
  {
    slug: 'twoPanel',
    labels: { singular: 'Two Panel Section', plural: 'Two Panel Sections' },
    fields: [
      { name: 'eyebrow', type: 'text' },
      { name: 'heading', type: 'text', required: true },
      { name: 'leftTitle', type: 'text', required: true },
      { name: 'leftText', type: 'textarea', required: true },
      { name: 'rightTitle', type: 'text', required: true },
      { name: 'rightText', type: 'textarea', required: true },
      {
        name: 'rightStyle',
        type: 'select',
        defaultValue: 'gradient',
        options: [
          { label: 'Default', value: 'default' },
          { label: 'Gradient', value: 'gradient' },
        ],
      },
      {
        name: 'softBackground',
        type: 'checkbox',
        defaultValue: false,
      },
    ],
  },
  {
    slug: 'steps',
    labels: { singular: 'Steps Section', plural: 'Steps Sections' },
    fields: [
      { name: 'eyebrow', type: 'text' },
      { name: 'heading', type: 'text', required: true },
      { name: 'subhead', type: 'textarea' },
      { name: 'anchorId', type: 'text' },
      {
        name: 'softBackground',
        type: 'checkbox',
        defaultValue: false,
      },
      {
        name: 'steps',
        type: 'array',
        required: true,
        fields: [
          { name: 'number', type: 'text', required: true },
          { name: 'title', type: 'text', required: true },
          { name: 'text', type: 'textarea', required: true },
        ],
      },
    ],
  },
  {
    slug: 'featureCards',
    labels: { singular: 'Feature Cards', plural: 'Feature Cards' },
    fields: [
      { name: 'eyebrow', type: 'text' },
      { name: 'heading', type: 'text', required: true },
      { name: 'subhead', type: 'textarea' },
      {
        name: 'features',
        type: 'array',
        required: true,
        fields: [
          { name: 'icon', type: 'text' },
          { name: 'title', type: 'text', required: true },
          { name: 'text', type: 'textarea', required: true },
        ],
      },
    ],
  },
  {
    slug: 'community',
    labels: { singular: 'Community Section', plural: 'Community Sections' },
    fields: [
      { name: 'eyebrow', type: 'text' },
      { name: 'heading', type: 'text', required: true },
      { name: 'text', type: 'textarea', required: true },
      { name: 'quote', type: 'textarea', required: true },
      { name: 'quoteAttribution', type: 'text' },
    ],
  },
  {
    slug: 'cta',
    labels: { singular: 'CTA Band', plural: 'CTA Bands' },
    fields: [
      { name: 'eyebrow', type: 'text' },
      { name: 'heading', type: 'text', required: true },
      { name: 'text', type: 'textarea' },
      { name: 'buttonLabel', type: 'text', required: true },
      { name: 'buttonHref', type: 'text', required: true },
      { name: 'anchorId', type: 'text' },
    ],
  },
  {
    slug: 'story',
    labels: { singular: 'Story Section', plural: 'Story Sections' },
    fields: [
      { name: 'image', type: 'text', required: true },
      { name: 'imageAlt', type: 'text', required: true },
      { name: 'eyebrow', type: 'text' },
      { name: 'heading', type: 'text', required: true },
      {
        name: 'paragraphs',
        type: 'array',
        required: true,
        fields: [{ name: 'text', type: 'textarea', required: true }],
      },
    ],
  },
  {
    slug: 'cardGrid',
    labels: { singular: 'Card Grid', plural: 'Card Grids' },
    fields: [
      { name: 'eyebrow', type: 'text' },
      { name: 'heading', type: 'text', required: true },
      {
        name: 'variant',
        type: 'select',
        required: true,
        defaultValue: 'beliefs',
        options: [
          { label: 'Beliefs', value: 'beliefs' },
          { label: 'Team', value: 'team' },
          { label: 'Guides', value: 'guides' },
          { label: 'Downloads', value: 'downloads' },
        ],
      },
      {
        name: 'softBackground',
        type: 'checkbox',
        defaultValue: false,
      },
      {
        name: 'cards',
        type: 'array',
        required: true,
        fields: [
          { name: 'meta', type: 'text' },
          { name: 'title', type: 'text', required: true },
          { name: 'text', type: 'textarea' },
          { name: 'image', type: 'text' },
          { name: 'imageAlt', type: 'text' },
          { name: 'role', type: 'text' },
          { name: 'href', type: 'text' },
          { name: 'linkLabel', type: 'text' },
          { name: 'platform', type: 'text' },
          { name: 'featured', type: 'checkbox', defaultValue: false },
          { name: 'buttonLabel', type: 'text' },
          { name: 'buttonHref', type: 'text' },
        ],
      },
    ],
  },
  {
    slug: 'pluginHero',
    labels: { singular: 'Plugin Hero', plural: 'Plugin Heroes' },
    fields: [
      { name: 'eyebrow', type: 'text' },
      { name: 'headline', type: 'text', required: true },
      { name: 'subhead', type: 'textarea' },
      {
        name: 'actions',
        type: 'array',
        maxRows: 2,
        fields: [
          ...linkFields,
          {
            name: 'variant',
            type: 'select',
            defaultValue: 'primary',
            options: [
              { label: 'Primary', value: 'primary' },
              { label: 'Secondary', value: 'secondary' },
            ],
          },
        ],
      },
      { name: 'image', type: 'text', required: true },
      { name: 'imageAlt', type: 'text', required: true },
      { name: 'caption', type: 'textarea' },
    ],
  },
  {
    slug: 'articleHeader',
    labels: { singular: 'Article Header', plural: 'Article Headers' },
    fields: [
      { name: 'backHref', type: 'text', defaultValue: '/guides' },
      { name: 'backLabel', type: 'text', defaultValue: 'Back to Guides' },
      { name: 'meta', type: 'text' },
      { name: 'headline', type: 'text', required: true },
      { name: 'intro', type: 'textarea' },
    ],
  },
  {
    slug: 'articleSections',
    labels: { singular: 'Article Sections', plural: 'Article Sections' },
    fields: [
      {
        name: 'sections',
        type: 'array',
        required: true,
        fields: [
          {
            name: 'type',
            type: 'select',
            required: true,
            options: [
              { label: 'Heading', value: 'heading' },
              { label: 'Paragraph', value: 'paragraph' },
              { label: 'Callout', value: 'callout' },
            ],
          },
          { name: 'heading', type: 'text' },
          { name: 'text', type: 'textarea' },
          { name: 'buttonLabel', type: 'text' },
          { name: 'buttonHref', type: 'text' },
        ],
      },
    ],
  },
  {
    slug: 'centeredActions',
    labels: { singular: 'Centered Actions', plural: 'Centered Actions' },
    fields: [
      { name: 'eyebrow', type: 'text' },
      { name: 'heading', type: 'text', required: true },
      { name: 'text', type: 'textarea' },
      { name: 'anchorId', type: 'text' },
      {
        name: 'actions',
        type: 'array',
        fields: [
          ...linkFields,
          {
            name: 'variant',
            type: 'select',
            defaultValue: 'primary',
            options: [
              { label: 'Primary', value: 'primary' },
              { label: 'Secondary', value: 'secondary' },
            ],
          },
        ],
      },
    ],
  },
]
