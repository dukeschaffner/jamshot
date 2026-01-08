import { betterAuth } from "better-auth";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pool = require('./src/config/db.cjs');
const bcrypt = require('bcryptjs');
const { sendVerificationEmail: sendLegacyVerificationEmail } = require('./src/utils/emailService.cjs');

/**
 * Send verification email using Better Auth format but legacy email service
 * @param {Object} data - Better Auth email verification data
 * @param {Object} data.user - User object with email and other properties
 * @param {string} data.url - Verification URL provided by Better Auth
 * @param {string} data.token - Verification token
 * @param {Object} request - Request object (optional)
 */
const sendVerificationEmail = async ({ user, url, token }, request) => {
  // Get username from user object (it's in additionalFields)
  const username = user.username || user.name || 'there';
  
  // Add callbackURL to redirect to home page after verification
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const homePageUrl = `${frontendUrl}/`;
  
  // Always set callbackURL to absolute URL (override any relative paths)
  const urlObj = new URL(url);
  urlObj.searchParams.set('callbackURL', homePageUrl);
  const urlWithCallback = urlObj.toString();
  
  // Use the legacy email service function with Better Auth's URL (now with callbackURL)
  return sendLegacyVerificationEmail(user.email, user.id, username, urlWithCallback);
};



export const auth = betterAuth({
  database: pool,
  baseURL: process.env.BETTER_AUTH_URL || `http://localhost:${process.env.PORT || 5001}`,
  basePath: '/api/auth',
  trustedOrigins: [
    'http://localhost:3000',
    'http://localhost:8081',
    'http://localhost:5173',
    `http://localhost:${process.env.PORT || 5001}`,
  ],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true, // Require email verification before login
  },
  emailVerification: {
    sendVerificationEmail: sendVerificationEmail,
    sendOnSignUp: true, // Automatically send verification email on signup
    autoSignInAfterVerification: true, // Auto sign in after verification
    expiresIn: 86400, // 24 hours in seconds
  },
  socialProviders: {
    google: { 
        clientId: process.env.GOOGLE_CLIENT_ID, 
        clientSecret: process.env.GOOGLE_CLIENT_SECRET, 
    }, 
  },
  user:{
    modelName: 'users',
    fields: {
      emailVerified: "email_verified",
      image: "profile_pic_url",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    additionalFields: {
			username: {
				type: "string",
				required: false,
			},
      password_hash: { // temp, can be removed after migration
        type: "string",
        required: false,
      },
		},
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => ({
          data: {
            ...user,
            username: ctx.body.username || null,
            password_hash: await bcrypt.hash(ctx.body.password, 10),
          },
        }),
      },
    },
  },
  session: {
    cookieCache: {
        enabled: true,
        maxAge: 60 * 60,
        strategy: "jwt" // or "jwt" or "jwe"
    }
  }
});