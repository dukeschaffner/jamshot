import posthog from 'posthog-js';

const token = process.env.NEXT_PUBLIC_POSTHOG_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

if (token) {
  posthog.init(token, {
    api_host: host,
    // Enables SPA history pageviews; see PostHog Next.js + SPA docs
    defaults: '2026-01-30',
  });
}