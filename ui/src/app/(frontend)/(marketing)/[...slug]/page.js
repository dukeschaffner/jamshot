import MarketingLayout from '@/components/marketing/MarketingLayout';
import MarketingPreviewTools from '@/components/marketing/MarketingPreviewTools';
import { buildPageMetadata } from '@/lib/marketing/constants';
import { getMarketingPage, getPublishedMarketingSlugs, isPreviewMode } from '@/lib/marketing/getMarketingPage';
import MarketingPage, { MarketingFallback } from '@/components/marketing/MarketingPage';
import { notFound } from 'next/navigation';

function slugFromParams(slugParam) {
  if (Array.isArray(slugParam)) return slugParam.join('/');
  return slugParam;
}

export async function generateStaticParams() {
  const slugs = await getPublishedMarketingSlugs();
  return slugs
    .filter((slug) => slug !== 'home')
    .map((slug) => ({ slug: slug.split('/') }));
}

export async function generateMetadata({ params }) {
  const { slug: slugParam } = await params;
  const slug = slugFromParams(slugParam);
  const preview = await isPreviewMode();
  const page = await getMarketingPage(slug, { preview });
  if (!page) {
    return { title: 'Sterio' };
  }
  const metadata = buildPageMetadata(page, slug);
  if (preview) {
    metadata.robots = { index: false, follow: false };
  }
  return metadata;
}

export default async function MarketingSlugPage({ params }) {
  const { slug: slugParam } = await params;
  const slug = slugFromParams(slugParam);
  const preview = await isPreviewMode();
  const page = await getMarketingPage(slug, { preview });

  if (!page && process.env.NODE_ENV === 'production' && !preview) {
    notFound();
  }

  return (
    <MarketingLayout>
      <MarketingPreviewTools page={page} />
      {page ? (
        <MarketingPage page={page} preview={preview} />
      ) : (
        <MarketingFallback slug={slug} preview={preview} />
      )}
    </MarketingLayout>
  );
}
