const LINK_PREVIEW_CRAWLER_PATTERN =
  /facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|telegrambot|whatsapp|discordbot|skypeuripreview|pinterest|redditbot|applebot|iframely|embedly|quora link preview|outbrain|vkshare|w3c_validator|googlebot|google-inspectiontool|bingbot|yeti|baiduspider|duckduckbot/i;

/**
 * Social / search crawlers that should receive HTML previews instead of a 302.
 * Humans still get the immediate redirect.
 */
export function isLinkPreviewCrawler(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') {
    return false;
  }
  return LINK_PREVIEW_CRAWLER_PATTERN.test(userAgent);
}
