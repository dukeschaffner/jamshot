import MarketingLayout from '@/components/marketing/MarketingLayout';
import { buildPageMetadata } from '@/lib/marketing/constants';
import { getMarketingPage, getPublishedMarketingSlugs } from '@/lib/marketing/getMarketingPage';
import MarketingPage, { MarketingFallback } from '@/components/marketing/MarketingPage';
import { notFound } from 'next/navigation';

export async function generateStaticParams() {
  const slugs = await getPublishedMarketingSlugs();
  return slugs
    .filter((slug) => slug !== 'home')
    .map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const page = await getMarketingPage(slug);
  if (!page) {
    return { title: 'Sterio' };
  }
  return buildPageMetadata(page, slug);
}

export default async function MarketingSlugPage({ params }) {
  const { slug } = await params;
  const page = await getMarketingPage(slug);

  if (!page && process.env.NODE_ENV === 'production') {
    notFound();
  }

  return (
    <MarketingLayout>
      {page ? <MarketingPage page={page} /> : <MarketingFallback slug={slug} />}
    </MarketingLayout>
  );
}
