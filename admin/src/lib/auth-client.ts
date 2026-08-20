import { createAuthClient } from 'better-auth/react';

const apiBaseURL =
  process.env.NEXT_PUBLIC_BETTER_AUTH_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:5001/api';

export const authClient = createAuthClient({
  baseURL: `${apiBaseURL}/auth`,
});
