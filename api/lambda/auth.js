import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pool = require('./src/config/db.cjs');
const bcrypt = require('bcryptjs');
const { sendVerificationEmail: sendLegacyVerificationEmail } = require('./src/utils/emailService.cjs');
const { validateDateOfBirth } = require('../../shared/utils/validation.cjs');

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
        before: async (user, ctx) => {
          const { username, name, password, dateOfBirth, acceptTerms } = ctx.body || {};
          
          // Validate username
          if (username) {
            const usernameLower = username.toLowerCase();
            // Username validation: only allow letters, numbers, and underscores
            if (!/^\w+$/.test(usernameLower)) {
              throw new APIError("BAD_REQUEST", {
                message: 'Username can only contain letters, numbers, and underscores.',
              });
            }
            // Username length validation: max 20 characters
            if (usernameLower.length > 20) {
              throw new APIError("BAD_REQUEST", {
                message: 'Username must be 20 characters or less.',
              });
            }
            // Prevent using "me" as username
            if (usernameLower === 'me') {
              throw new APIError("BAD_REQUEST", {
                message: 'Username "me" is not allowed',
              });
            }
            // Check if username already exists
            const usernameCheck = await pool.query('SELECT id FROM users WHERE username = $1', [usernameLower]);
            if (usernameCheck.rows.length > 0) {
              throw new APIError("BAD_REQUEST", {
                message: 'Username is already taken',
              });
            }
          }
          
          // Validate name
          if (!name || name.trim() === '') {
            throw new APIError("BAD_REQUEST", {
              message: 'Name is required',
            });
          }
          // Name length validation: max 40 characters
          if (name.length > 40) {
            throw new APIError("BAD_REQUEST", {
              message: 'Name must be 40 characters or less.',
            });
          }
          
          // Validate email
          if (!user.email || user.email.trim() === '') {
            throw new APIError("BAD_REQUEST", {
              message: 'Email is required',
            });
          }
          // Check if email already exists
          const emailCheck = await pool.query('SELECT id FROM users WHERE email = $1', [user.email]);
          if (emailCheck.rows.length > 0) {
            throw new APIError("BAD_REQUEST", {
              message: 'Email is already registered',
            });
          }
          
          // Validate date of birth
          if (dateOfBirth) {
            const dobValidation = validateDateOfBirth(dateOfBirth);
            if (!dobValidation.valid) {
              throw new APIError("BAD_REQUEST", {
                message: dobValidation.error,
              });
            }
          }
          
          // Validate password
          if (password) {
            // Password must be at least 8 characters long
            if (password.length < 8) {
              throw new APIError("BAD_REQUEST", {
                message: 'Password must be at least 8 characters long',
              });
            }
            // Password must contain at least one uppercase letter
            if (!/[A-Z]/.test(password)) {
              throw new APIError("BAD_REQUEST", {
                message: 'Password must contain at least one uppercase letter',
              });
            }
            // Password must contain at least one lowercase letter
            if (!/[a-z]/.test(password)) {
              throw new APIError("BAD_REQUEST", {
                message: 'Password must contain at least one lowercase letter',
              });
            }
            // Password must contain at least one number
            if (!/\d/.test(password)) {
              throw new APIError("BAD_REQUEST", {
                message: 'Password must contain at least one number',
              });
            }
            // Password must contain at least one special character
            if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
              throw new APIError("BAD_REQUEST", {
                message: 'Password must contain at least one special character',
              });
            }
          }
          
          // Validate terms acceptance
          if (acceptTerms !== true) {
            throw new APIError("BAD_REQUEST", {
              message: 'You must accept the Terms of Service and Privacy Policy to register.',
            });
          }
          
          return {
            data: {
              ...user,
              username: username ? username.toLowerCase() : null,
              password_hash: password ? await bcrypt.hash(password, 10) : null,
            },
          };
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Validate password on reset password endpoint
      if (ctx.path === '/reset-password') {
        const { newPassword } = ctx.body || {};
        if (newPassword) {
          // Password must be at least 8 characters long
          if (newPassword.length < 8) {
            throw new APIError("BAD_REQUEST", {
              message: 'Password must be at least 8 characters long',
            });
          }
          // Password must contain at least one uppercase letter
          if (!/[A-Z]/.test(newPassword)) {
            throw new APIError("BAD_REQUEST", {
              message: 'Password must contain at least one uppercase letter',
            });
          }
          // Password must contain at least one lowercase letter
          if (!/[a-z]/.test(newPassword)) {
            throw new APIError("BAD_REQUEST", {
              message: 'Password must contain at least one lowercase letter',
            });
          }
          // Password must contain at least one number
          if (!/\d/.test(newPassword)) {
            throw new APIError("BAD_REQUEST", {
              message: 'Password must contain at least one number',
            });
          }
          // Password must contain at least one special character
          if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword)) {
            throw new APIError("BAD_REQUEST", {
              message: 'Password must contain at least one special character',
            });
          }
        }
      }
    }),
  },
  session: {
    cookieCache: {
        enabled: true,
        maxAge: 60 * 60,
        strategy: "jwt" // or "jwt" or "jwe"
    }
  }
});