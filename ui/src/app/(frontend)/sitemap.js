import { pathFromSlug, SITE_URL } from '@/lib/marketing/constants';
import { getPublishedMarketingSlugs } from '@/lib/marketing/getMarketingPage';

function sitemapPriority(slug) {
  if (slug === 'home') return 1;
  if (slug === 'plugin') return 0.9;
  if (slug.startsWith('guide-')) return 0.7;
  return 0.8;
}

function sitemapChangeFrequency(slug) {
  if (slug === 'home' || slug === 'guides') return 'weekly';
  return 'monthly';
}

export default async function sitemap() {
  const slugs = await getPublishedMarketingSlugs();

  return slugs.map((slug) => ({
    url: `${SITE_URL}${pathFromSlug(slug)}`,
    lastModified: new Date(),
    changeFrequency: sitemapChangeFrequency(slug),
    priority: sitemapPriority(slug),
  }));
}
