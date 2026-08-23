import { logger } from '@/lib/logger';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://jamshot-api.azurewebsites.net';

export const MISSING_TRACK_METADATA = {
  title: 'Track | Sterio',
  description: 'Listen to music on Sterio',
};

export function getSiteBaseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://sterio.fm');
}

export async function fetchTrackForMetadata(trackId, secret = null) {
  if (!trackId) {
    return null;
  }

  try {
    const url = secret
      ? `${API_URL}/tracks/${trackId}?secret=${secret}`
      : `${API_URL}/tracks/${trackId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      next: {
        revalidate: 3600,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch (error) {
    logger.error('Error fetching track for metadata:', error);
    return null;
  }
}

/**
 * Open Graph / Twitter preview for a track page.
 * Shared by /track/{id} and outreach short links that destine to a track.
 */
export function buildTrackMetadata(track) {
  if (!track) {
    return MISSING_TRACK_METADATA;
  }

  const baseUrl = getSiteBaseUrl();
  const trackUrl = `${baseUrl}/track/${track.guid}`;

  let imageUrl = track.profile_pic_url || `${baseUrl}/avatar.svg`;
  if (imageUrl && !imageUrl.startsWith('http')) {
    imageUrl = imageUrl.startsWith('/') ? `${baseUrl}${imageUrl}` : `${baseUrl}/${imageUrl}`;
  }

  const artistName = track.username || 'Unknown Artist';
  const description = `Collaborate on "${track.title}" by ${artistName}`;

  return {
    title: `${track.title} by ${artistName} | Sterio`,
    description,
    openGraph: {
      title: `${track.title} by ${artistName}`,
      description,
      url: trackUrl,
      siteName: 'Sterio',
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: `${track.title} by ${artistName}`,
        },
      ],
      type: 'music.song',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${track.title} by ${artistName}`,
      description,
      images: [imageUrl],
    },
    other: {
      'music:duration': track.duration?.toString() || '0',
    },
  };
}

export async function generateTrackMetadata({ trackId, params, secret = null } = {}) {
  let id = trackId;
  if (!id && params) {
    const resolved = await params;
    id = resolved?.trackId;
  }

  const track = await fetchTrackForMetadata(id, secret);
  return buildTrackMetadata(track);
}
