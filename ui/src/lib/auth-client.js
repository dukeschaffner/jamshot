import { createAuthClient } from 'better-auth/react';

// Create Better Auth client instance
// This should match the server configuration in api/lambda/auth.js
// Include the basePath in the baseURL since Better Auth doesn't support separate basePath option
const apiBaseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
export const authClient = createAuthClient({
  baseURL: `${apiBaseURL}/auth`,
});

