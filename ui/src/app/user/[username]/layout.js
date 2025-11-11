const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://jamshot-api.azurewebsites.net';

async function getUserData(username) {
  try {
    const url = `${API_URL}/users/by-username/${username}`;
    
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
    return data;
  } catch (error) {
    console.error('Error fetching user for metadata:', error);
    return null;
  }
}

export async function generateMetadata({ params }) {
  const { username } = params;
  
  // Fetch user data - Next.js caching will reduce API calls
  // Results are cached for 1 hour, so multiple requests reuse the cached data
  let user = await getUserData(username);
  
  // If user not found, return generic metadata
  if (!user) {
    return {
      title: `@${username} | Sterio`,
      description: `View ${username}'s profile on Sterio`,
    };
  }

  // Build the full URL for this user
  // In development, use localhost. In production, use the site URL or default.
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 
    (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://sterio.fm');
  const userUrl = `${baseUrl}/user/${username}`;

  // Use profile picture as the image, or a default
  // Ensure image URL is absolute
  let imageUrl = user.profile_pic_url || `${baseUrl}/avatar.svg`;
  if (imageUrl && !imageUrl.startsWith('http')) {
    imageUrl = imageUrl.startsWith('/') ? `${baseUrl}${imageUrl}` : `${baseUrl}/${imageUrl}`;
  }
  
  // Build description
  const displayName = user.name || user.username;
  const bio = user.bio || '';
  const description = bio 
    ? `${displayName} on Sterio - ${bio}`
    : `View ${displayName}'s music and collaborations on Sterio`;

  return {
    title: `${displayName} (@${username}) | Sterio`,
    description,
    openGraph: {
      title: `${displayName} (@${username})`,
      description,
      url: userUrl,
      siteName: 'Sterio',
      type: 'profile',
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: `${displayName}'s profile`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${displayName} (@${username})`,
      description,
      images: [imageUrl],
    },
  };
}

export default function UserLayout({ children }) {
  return children;
}

