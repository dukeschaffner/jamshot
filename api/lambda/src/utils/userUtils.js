export const SOCIAL_LINK_CONFIG = {
  tiktok_url: {
    label: 'TikTok',
    baseUrl: 'https://www.tiktok.com/',
    allowedHosts: ['tiktok.com', 'www.tiktok.com']
  },
  youtube_url: {
    label: 'YouTube',
    baseUrl: 'https://www.youtube.com/',
    allowedHosts: ['youtube.com', 'www.youtube.com', 'm.youtube.com']
  },
  instagram_url: {
    label: 'Instagram',
    baseUrl: 'https://www.instagram.com/',
    allowedHosts: ['instagram.com', 'www.instagram.com']
  },
  facebook_url: {
    label: 'Facebook',
    baseUrl: 'https://www.facebook.com/',
    allowedHosts: ['facebook.com', 'www.facebook.com', 'm.facebook.com']
  },
  x_url: {
    label: 'X',
    baseUrl: 'https://x.com/',
    allowedHosts: ['x.com', 'www.x.com']
  }
};

export const SOCIAL_LINK_FIELDS = Object.keys(SOCIAL_LINK_CONFIG);

const hasHttpProtocol = (value) => /^https?:\/\//i.test(value);

const normalizeRoute = (value) => value.replace(/^\/+/, '');

export const normalizeSocialLink = (field, value) => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  const config = SOCIAL_LINK_CONFIG[field];
  if (!config) {
    return null;
  }

  try {
    if (hasHttpProtocol(trimmedValue)) {
      const parsedUrl = new URL(trimmedValue);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return null;
      }

      if (!config.allowedHosts.includes(parsedUrl.hostname.toLowerCase())) {
        return null;
      }

      if (!parsedUrl.pathname || parsedUrl.pathname === '/') {
        return null;
      }

      return parsedUrl.toString();
    }

    const normalizedPath = normalizeRoute(trimmedValue);
    if (!normalizedPath) {
      return null;
    }

    return new URL(normalizedPath, config.baseUrl).toString();
  } catch (error) {
    return null;
  }
};
