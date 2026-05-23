import Script from 'next/script';
import { notFound } from 'next/navigation';
import MarketingBlockRenderer from '@/components/marketing/MarketingBlockRenderer';

export default function MarketingPage({ page, preview = false }) {
  if (!page) {
    notFound();
  }

  const structuredData = page.seo?.structuredData;

  return (
    <>
      {structuredData && !preview && (
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

export function MarketingFallback({ slug, preview = false }) {
  if (preview) {
    return (
      <section style={{ padding: '96px 24px', textAlign: 'center' }}>
        <h1>Preview unavailable</h1>
        <p>
          No saved page found for &ldquo;{slug}&rdquo;. Save the page in the CMS admin, then refresh preview.
        </p>
      </section>
    );
  }

  if (process.env.NODE_ENV !== 'production') {
    return (
      <section style={{ padding: '96px 24px', textAlign: 'center' }}>
        <h1>Page unavailable</h1>
        <p>
          The marketing page &ldquo;{slug}&rdquo; has not been published in the CMS yet.
          Seed content with <code>npm run seed:marketing --workspace=cms</code> (CMS app).
        </p>
      </section>
    );
  }

  return null;
}
