import MarketingLayout from '@/components/marketing/MarketingLayout';
import MarketingPage, { MarketingFallback } from '@/components/marketing/MarketingPage';
import { buildPageMetadata } from '@/lib/marketing/constants';
import { getMarketingPage } from '@/lib/marketing/getMarketingPage';

export async function generateMetadata() {
  const page = await getMarketingPage('home');
  if (!page) {
    return { title: 'Sterio.fm — Music Collaboration for Artists & Producers' };
  }
  return buildPageMetadata(page, 'home');
}

export default async function Page() {
  const marketingPage = await getMarketingPage('home');

  return (
    <MarketingLayout>
      {marketingPage ? <MarketingPage page={marketingPage} /> : <MarketingFallback slug="home" />}
    </MarketingLayout>
  );
}
