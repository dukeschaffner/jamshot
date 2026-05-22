import Script from 'next/script';
import { notFound } from 'next/navigation';
import MarketingBlockRenderer from '@/components/marketing/MarketingBlockRenderer';

export default function MarketingPage({ page }) {
  if (!page) {
    notFound();
  }

  const structuredData = page.seo?.structuredData;

  return (
    <>
      {structuredData && (
        <Script
          id={`structured-data-${page.slug}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData),
          }}
        />
      )}
      <MarketingBlockRenderer layout={page.layout} />
    </>
  );
}

export function MarketingFallback({ slug }) {
  return (
    <section style={{ padding: '96px 24px', textAlign: 'center' }}>
      <h1>Page unavailable</h1>
      <p>
        The marketing page &ldquo;{slug}&rdquo; has not been published in the CMS yet.
        Seed content with <code>node scripts/seed-marketing-pages.mjs</code>.
      </p>
    </section>
  );
}
