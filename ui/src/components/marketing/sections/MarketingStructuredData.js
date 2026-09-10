import Script from 'next/script';

export default function MarketingStructuredData({ id, data }) {
  if (!data) return null;

  return (
    <Script
      id={id}
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data),
      }}
    />
  );
}
