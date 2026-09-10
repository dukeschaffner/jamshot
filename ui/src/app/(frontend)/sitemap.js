import { pathFromSlug, SITE_URL } from '@/lib/marketing/constants';

const MARKETING_SITEMAP_SLUGS = [
  'home',
  'about',
  'guides',
  'guides/find-producer',
  'guides/long-distance-collab',
  'guides/share-music-projects',
  'guides/unfinished-songs',
  'guides/collaborate-on-music-online-without-same-daw',
  'guides/find-musicians-to-collaborate-with',
  'plugin',
];

function sitemapPriority(slug) {
  if (slug === 'home') return 1;
  if (slug === 'plugin') return 0.9;
  if (slug.startsWith('guides/')) return 0.7;
  return 0.8;
}

function sitemapChangeFrequency(slug) {
  if (slug === 'home' || slug === 'guides') return 'weekly';
  return 'monthly';
}

export default function sitemap() {
  return MARKETING_SITEMAP_SLUGS.map((slug) => ({
    url: `${SITE_URL}${pathFromSlug(slug)}`,
    lastModified: new Date(),
    changeFrequency: sitemapChangeFrequency(slug),
    priority: sitemapPriority(slug),
  }));
}
