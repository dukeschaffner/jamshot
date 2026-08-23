import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isLinkPreviewCrawler } from '@/lib/linkPreviewCrawler';
import { generateOutreachShortLinkMetadata } from '@/lib/outreachShortLinkMetadata';
import { extractOutreachCodeFromSlug } from '@/lib/outreachShortPath';
import { recordOutreachClick } from '@/lib/outreachShortLinkRequest';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const code = extractOutreachCodeFromSlug(slug);
  return generateOutreachShortLinkMetadata(code);
}

export default async function OutreachShortLinkPage({ params }) {
  const { slug } = await params;
  const code = extractOutreachCodeFromSlug(slug);
  if (!code) {
    redirect('/');
  }

  const incomingHeaders = await headers();
  if (isLinkPreviewCrawler(incomingHeaders.get('user-agent'))) {
    return null;
  }

  const redirectUrl = await recordOutreachClick(code, incomingHeaders);
  redirect(redirectUrl || '/');
}
