import { betterAuth } from 'better-auth';
const require = createRequire(import.meta.url);
const pool = require('./src/config/db.cjs');

export const auth = betterAuth({
  database: pool,
  baseURL: process.env.BETTER_AUTH_URL || process.env.FRONTEND_URL || 'http://localhost:3000',
  basePath: '/api/auth',
  emailAndPassword: {
    enabled: false, // Disable email/password - we use our own system
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
  },
  // Better Auth session config (we'll convert to our JWT system in the completion route)
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days (matches our refresh token)
    updateAge: 60 * 60 * 24, // 1 day
  },
});


