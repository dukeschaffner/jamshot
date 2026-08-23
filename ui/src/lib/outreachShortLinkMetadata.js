import { generateTrackMetadata } from '@/lib/trackMetadata';
import { fetchPublicOutreachLink } from '@/lib/outreachShortLinkRequest';

const FALLBACK_METADATA = {
  title: 'Sterio',
  description: 'Create, collaborate, and share music with Sterio.',
  robots: { index: false, follow: true },
};

function withNoIndex(metadata) {
  return {
    ...metadata,
    robots: { index: false, follow: true },
  };
}

/**
 * Preview for an outreach short URL. Track destinations reuse the track page
 * metadata so the card matches sharing /track/{guid} directly.
 */
export async function generateOutreachShortLinkMetadata(code) {
  if (!code) {
    return FALLBACK_METADATA;
  }

  const link = await fetchPublicOutreachLink(code);
  if (!link) {
    return FALLBACK_METADATA;
  }

  if (link.destinationKind === 'track' && link.destinationId) {
    return withNoIndex(await generateTrackMetadata({ trackId: link.destinationId }));
  }

  return FALLBACK_METADATA;
}
