const apiBase = () =>
  (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api').replace(/\/$/, '');

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data as T;
}

export type OutreachCampaign = {
  id: number;
  name: string;
  slug: string;
  created_at?: string;
  link_count?: number;
};

export type OutreachMessageVariant = {
  id: number;
  name: string;
  slug: string;
  body?: string | null;
};

export type OutreachLink = {
  id: number;
  campaign_id: number;
  message_variant_id: number;
  platform: string;
  method: string;
  artist_handle: string | null;
  destination_path: string;
  code: string;
  short_url: string;
  click_count?: number;
  campaign_slug?: string;
  message_variant_slug?: string;
  message_variant_name?: string;
};

export const outreachApi = {
  getMe: () =>
    request<{ id: string; email: string; username: string; is_admin: boolean }>(
      '/users/me'
    ),

  getMeta: () =>
    request<{ platforms: string[]; methods: string[] }>('/outreach/meta'),

  listCampaigns: () =>
    request<{ campaigns: OutreachCampaign[] }>('/outreach/campaigns'),

  createCampaign: (body: { name: string; slug?: string }) =>
    request<{ campaign: OutreachCampaign }>('/outreach/campaigns', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getCampaign: (id: number) =>
    request<{ campaign: OutreachCampaign; links: OutreachLink[] }>(
      `/outreach/campaigns/${id}`
    ),

  listMessageVariants: () =>
    request<{ messageVariants: OutreachMessageVariant[] }>(
      '/outreach/message-variants'
    ),

  createMessageVariant: (body: { name: string; slug?: string; body?: string }) =>
    request<{ messageVariant: OutreachMessageVariant }>(
      '/outreach/message-variants',
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    ),

  createLink: (body: {
    campaignId: number;
    messageVariantId: number;
    platform: string;
    method: string;
    artistHandle?: string;
    destinationPath?: string;
  }) =>
    request<{ link: OutreachLink }>('/outreach/links', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
