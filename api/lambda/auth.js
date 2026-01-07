import { betterAuth } from "better-auth";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pool = require('./src/config/db.cjs');

export const auth = betterAuth({
  database: pool,
  baseURL: process.env.BETTER_AUTH_URL || process.env.FRONTEND_URL || 'http://localhost:3000',
  basePath: '/api/auth',
  trustedOrigins: [
    'http://localhost:3000',
    'http://localhost:8081',
    'http://localhost:5173',
  ],
  emailAndPassword: {
    enabled: false, // Disable email/password - we use our own system
  },
  socialProviders: {
    google: { 
        clientId: process.env.GOOGLE_CLIENT_ID, 
        clientSecret: process.env.GOOGLE_CLIENT_SECRET, 
    }, 
  },
});