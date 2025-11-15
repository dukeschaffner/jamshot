import Script from 'next/script';
import ClientLayout from './ClientLayout';

// Viewport configuration (must be exported separately in Next.js App Router)
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

// Static metadata for the site
export const metadata = {
  title: 'Sterio - Collaborate on Music',
  description: 'Create, collaborate, and share music with Sterio. Record layers, collaborate with artists, and build tracks together.',
  keywords: ['music', 'collaboration', 'recording', 'music production', 'collaborative music'],
  authors: [{ name: 'Sterio' }],
  icons: {
    icon: '/next.svg',
    type: 'image/svg+xml',
  },
  openGraph: {
    title: 'Sterio - Collaborate on Music',
    description: 'Create, collaborate, and share music with Sterio. Record layers, collaborate with artists, and build tracks together.',
    url: 'https://sterio.fm',
    siteName: 'Sterio',
    type: 'website',
    images: [
      {
        url: 'https://sterio.fm/next.svg',
        width: 1200,
        height: 630,
        alt: 'Sterio - Collaborate on Music',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sterio - Collaborate on Music',
    description: 'Create, collaborate, and share music with Sterio. Record layers, collaborate with artists, and build tracks together.',
    images: ['https://sterio.fm/next.svg'],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {/* Google AdSense Script */}
        <Script
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1172686264367392"
          strategy="afterInteractive"
          crossOrigin="anonymous"
        />
        <ClientLayout>
          {children}
        </ClientLayout>
      </body>
    </html>
  );
}