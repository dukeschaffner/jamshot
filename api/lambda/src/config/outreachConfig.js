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

/** Query param used to persist short-code attribution on the Sterio client */
export const OUTREACH_CODE_QUERY_PARAM = 'oc';

export const OUTREACH_CODE_STORAGE_KEY = 'sterio_outreach_code';
