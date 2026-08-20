/**
 * Outreach platform / method enums used when creating attribution links.
 */
export const OUTREACH_PLATFORMS = [
  'instagram',
  'tiktok',
  'youtube',
  'x',
  'email',
  'discord',
  'other',
];

export const OUTREACH_METHODS = [
  'dm',
  'comment',
  'story',
  'bio',
  'post',
  'email',
  'other',
];

export const OUTREACH_CODE_LENGTH = 6;

/** Random campaign / message slugs when none is provided */
export const OUTREACH_RANDOM_SLUG_LENGTH = 8;

/** Max stored site-relative destination path (pathname + search) */
export const OUTREACH_DESTINATION_PATH_MAX_LENGTH = 500;

/** Query param used to persist short-code attribution on the Sterio client */
export const OUTREACH_CODE_QUERY_PARAM = 'oc';

export const OUTREACH_CODE_STORAGE_KEY = 'sterio_outreach_code';
