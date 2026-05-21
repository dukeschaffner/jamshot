const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://jamshot-api.azurewebsites.net';

async function getTrackData(trackId, secret = null) {
  try {
    const url = secret 
      ? `${API_URL}/tracks/${trackId}?secret=${secret}`
      : `${API_URL}/tracks/${trackId}`;
    
    // Cache for 1 hour (3600 seconds) - reduces API calls significantly
    // Next.js will reuse cached results across requests
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      next: { 
        revalidate: 3600 // Revalidate every hour
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    // trackApi.getTrack returns an array, we take the first track
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch (error) {
    console.error('Error fetching track for metadata:', error);
    return null;
  }
}

export async function generateMetadata({ params }) {
  const { trackId } = params;
  
  // Fetch track data - Next.js caching will reduce API calls
  // Results are cached for 1 hour, so multiple requests reuse the cached data
  let track = await getTrackData(trackId);
  
  // If track is private or not found, return generic metadata
  // Note: We can't access searchParams in generateMetadata, so we'll generate
  // metadata for the public URL. Private tracks will need special handling.
  if (!track) {
    return {
      title: 'Track | Sterio',
      description: 'Listen to music on Sterio',
    };
  }

  // Build the full URL for this track using GUID for public-facing URLs
  // In development, use localhost. In production, use the site URL or default.
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 
    (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://sterio.fm');
  const trackUrl = `${baseUrl}/track/${track.guid}`;

  // Use profile picture as the image, or a default
  // Ensure image URL is absolute
  let imageUrl = track.profile_pic_url || `${baseUrl}/avatar.svg`;
  if (imageUrl && !imageUrl.startsWith('http')) {
    imageUrl = imageUrl.startsWith('/') ? `${baseUrl}${imageUrl}` : `${baseUrl}/${imageUrl}`;
  }
  
  // Build description
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

export default function TrackLayout({ children }) {
  return children;
}

