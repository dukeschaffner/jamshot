import {
  BlocksFeature,
  BoldFeature,
  ItalicFeature,
  LinkFeature,
  lexicalEditor,
  OrderedListFeature,
  ParagraphFeature,
  UnderlineFeature,
  UnorderedListFeature,
} from '@payloadcms/richtext-lexical'

import { htmlSnippetBlock } from './lexicalBlocks/htmlSnippet'

export const marketingLexicalEditor = lexicalEditor({
  features: () => [
    ParagraphFeature(),
    BoldFeature(),
    ItalicFeature(),
    UnderlineFeature(),
    LinkFeature(),
    OrderedListFeature(),
    UnorderedListFeature(),
    BlocksFeature({
      blocks: [htmlSnippetBlock],
    }),
  ],
})
