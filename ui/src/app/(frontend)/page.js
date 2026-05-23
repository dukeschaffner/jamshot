import MarketingLayout from '@/components/marketing/MarketingLayout';
import MarketingPreviewTools from '@/components/marketing/MarketingPreviewTools';
import MarketingPage, { MarketingFallback } from '@/components/marketing/MarketingPage';
import { buildPageMetadata } from '@/lib/marketing/constants';
import { getMarketingPage, isPreviewMode } from '@/lib/marketing/getMarketingPage';
import { notFound } from 'next/navigation';

export async function generateMetadata() {
  const preview = await isPreviewMode();
  const page = await getMarketingPage('home', { preview });
  if (!page) {
    return { title: 'Sterio.fm — Music Collaboration for Artists & Producers' };
  }
  const metadata = buildPageMetadata(page, 'home');
  if (preview) {
    metadata.robots = { index: false, follow: false };
  }
  return metadata;
}

export default async function Page() {
  const preview = await isPreviewMode();
  const marketingPage = await getMarketingPage('home', { preview });

  if (!marketingPage && !preview) {
    if (process.env.NODE_ENV === 'production') {
      notFound();
    }
  }

  return (
    <MarketingLayout>
      <MarketingPreviewTools page={marketingPage} />
      {marketingPage ? (
        <MarketingPage page={marketingPage} preview={preview} />
      ) : (
        <MarketingFallback slug="home" preview={preview} />
      )}
    </MarketingLayout>
  );
}
