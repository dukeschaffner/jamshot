import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { customSession } from "better-auth/plugins";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pool = require('./src/config/db.cjs');
const bcrypt = require('bcryptjs');
const { sendVerificationEmail: sendLegacyVerificationEmail, sendPasswordResetEmail: sendLegacyPasswordResetEmail } = require('./src/utils/emailService.cjs');
const { validateDateOfBirth } = require('./shared/utils/validation.cjs');

/**
 * Send verification email using Better Auth format but legacy email service
 * @param {Object} data - Better Auth email verification data
 * @param {Object} data.user - User object with email and other properties
 * @param {string} data.url - Verification URL provided by Better Auth
 * @param {string} data.token - Verification token
 * @param {Object} request - Request object (optional)
 */
const sendVerificationEmail = async ({ user, url, token }, request) => {
  try {
    // Get username from user object (it's in additionalFields)
    const username = user.username || user.name || 'there';

    // Add callbackURL to redirect to home page after verification
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const homePageUrl = `${frontendUrl}/`;

    // Always set callbackURL to absolute URL (override any relative paths)
    const urlObj = new URL(url);
    urlObj.searchParams.set('callbackURL', homePageUrl);
    const urlWithCallback = urlObj.toString();

    // Send email and properly handle the promise
    // Use Promise.resolve to ensure we return a settled promise
    await Promise.resolve(sendLegacyVerificationEmail(user.email, user.id, username, urlWithCallback));

    return { success: true };
  } catch (error) {
    console.error('❌ Email verification sending failed:', error);
    // Return success even on failure to prevent auth flow interruption
    // The user can still verify their account through other means
    return { success: true };
  }
};

/**
 * Send password reset email using Better Auth format but legacy email service
 * @param {Object} data - Better Auth password reset data
 * @param {Object} data.user - User object with email and other properties
 * @param {string} data.url - Reset URL provided by Better Auth
 * @param {string} data.token - Reset token
 * @param {Object} request - Request object (optional)
 */
const sendResetPassword = async ({ user, url, token }, request) => {
  try {
    // Get username from user object (it's in additionalFields)
    const username = user.username || user.name || 'there';

    // Use the legacy email service function with Better Auth's URL
    await sendLegacyPasswordResetEmail(user.email, user.id, username, url);

    return { success: true };
  } catch (error) {
    console.error('❌ Password reset email sending failed:', error);
    // Return success even on failure to prevent auth flow interruption
    return { success: true };
  }
};


export const auth = betterAuth({
  database: pool,
  baseURL: process.env.API_URL + '/auth',
  basePath: '/api/auth',
  trustedOrigins: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'https://dev.d3cx888lrkmdbn.amplifyapp.com'
  ],
  logger: {
    level: 'debug',
  },
  onAPIError: {
    onError: (error, ctx) => {
      // Enhanced error logging for debugging
      console.error('❌ BETTER AUTH ERROR:');
      console.error('  - Error:', error);
      console.error('  - Path:', ctx.path);
      console.error('  - Method:', ctx.method);
      console.error('  - Query:', ctx.query);
      console.error('  - Headers:', ctx.headers);
      console.error('  - Body:', ctx.body ? '[PRESENT]' : '[NOT PRESENT]');
      console.error('  - Stack:', error.stack);

      // Special logging for OAuth state mismatch errors
      if (error?.message?.includes('state') || ctx.query?.error === 'state_mismatch') {
        console.error('🚨 OAUTH STATE MISMATCH DEBUG:');
        console.error('  - Error message:', error.message);
        console.error('  - Query state:', ctx.query?.state);
        console.error('  - Query error:', ctx.query?.error);
        console.error('  - Session cookies present:', !!ctx.headers?.cookie);

        if (ctx.headers?.cookie) {
          const cookies = ctx.headers.cookie.split(';').map(c => c.trim());
          const sessionCookie = cookies.find(c => c.startsWith('__Secure-better-auth.session_token='));
          if (sessionCookie) {
            console.error('  - Session token exists but may be invalid/corrupted');
          } else {
            console.error('  - Session token MISSING - this could cause state mismatch');
          }
        }
      }
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true, // Require email verification before login
    sendResetPassword: sendResetPassword,
  },
  emailVerification: {
    sendVerificationEmail: sendVerificationEmail,
    sendOnSignUp: true, // Automatically send verification email on signup
    sendOnSignIn: false, // Disable automatic resend on login attempts
    autoSignInAfterVerification: true, // Auto sign in after verification
    expiresIn: 86400, // 24 hours in seconds
  },
  socialProviders: {
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
  },
  session: {
    cookieCache: {
        enabled: true,
        maxAge: 60 * 60,
        strategy: "jwt" // or "jwt" or "jwe"
    }
  },
  advanced: {
    disableCSRFCheck: true,
    disableOriginCheck: true,
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
      // Remove partitioned to allow cross-site cookie access during OAuth callbacks
      // partitioned: true // New browser standards will mandate this for foreign cookies
    }
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
      date_of_birth: {
        type: "date",
        required: false,
        input: false, // Don't allow user to set this directly during signup
      },
      terms_accepted: {
        type: "boolean",
        required: false,
        input: false, // Don't allow user to set this directly during signup
      },
      privacy_policy_accepted: {
        type: "boolean",
        required: false,
        input: false, // Don't allow user to set this directly during signup
      },
		},
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          const { username, name, password, dateOfBirth, acceptTerms } = ctx.body || {};
          
          // Check if this is an OAuth signup
          const isOAuthSignup = ctx.path === '/callback/:id' || ctx.path?.includes('/callback/');
          
          // For OAuth signups, use name from user object (populated by Better Auth from provider profile)
          // For email/password signups, use name from request body
          const userDisplayName = isOAuthSignup ? (user.name || name) : name;
          
          // Generate username for OAuth signups if not provided
          let finalUsername = username;
          if (isOAuthSignup && !username && user.email) {
            // Extract part before @ from email
            const emailPrefix = user.email.split('@')[0];
            
            // Sanitize: keep only alphanumeric and underscores, convert to lowercase
            let baseUsername = emailPrefix.toLowerCase().replace(/[^a-z0-9_]/g, '');
            
            // If empty after sanitization, use a default
            if (!baseUsername) {
              baseUsername = 'user';
            }
            
            // Prevent using "me" as base username
            if (baseUsername === 'me') {
              baseUsername = 'user';
            }
            
            // Truncate to leave room for suffix (max 18 chars to allow for "_99")
            if (baseUsername.length > 18) {
              baseUsername = baseUsername.substring(0, 18);
            }
            
            // Try base username first, then increment suffix until available
            let candidateUsername = baseUsername;
            let suffix = 0;
            let foundAvailable = false;
            
            while (!foundAvailable && suffix < 1000) {
              // Check if username is available
              const usernameCheck = await pool.query('SELECT id FROM users WHERE username = $1', [candidateUsername]);
              
              if (usernameCheck.rows.length === 0) {
                foundAvailable = true;
                finalUsername = candidateUsername;
              } else {
                // Increment suffix and try again
                suffix++;
                candidateUsername = `${baseUsername}${suffix}`;
                
                // Ensure total length doesn't exceed 20 characters
                if (candidateUsername.length > 20) {
                  // Truncate base to leave room for suffix
                  const maxBaseLength = 20 - String(suffix).length;
                  baseUsername = baseUsername.substring(0, maxBaseLength);
                  candidateUsername = `${baseUsername}${suffix}`;
                }
              }
            }
            
            if (!foundAvailable) {
              throw new APIError("BAD_REQUEST", {
                message: 'Unable to generate a unique username. Please try again later.',
              });
            }
          }
          
          // Validate username (either provided or generated)
          if (finalUsername) {
            const usernameLower = finalUsername.toLowerCase();
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
            // Check if username already exists (only for non-OAuth or if username was provided)
            if (!isOAuthSignup || username) {
              const usernameCheck = await pool.query('SELECT id FROM users WHERE username = $1', [usernameLower]);
              if (usernameCheck.rows.length > 0) {
                throw new APIError("BAD_REQUEST", {
                  message: 'Username is already taken',
                });
              }
            }
          }
          
          // Validate name
          if (!userDisplayName || userDisplayName.trim() === '') {
            throw new APIError("BAD_REQUEST", {
              message: 'Name is required',
            });
          }
          // Name length validation: max 40 characters
          if (userDisplayName.length > 40) {
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
          else if(!isOAuthSignup) {
            throw new APIError("BAD_REQUEST", {
              message: 'Date of birth is required',
            });
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
          
          // Validate terms acceptance - only required for email/password signups, not OAuth
          // OAuth signups will be redirected to complete-profile page to accept terms
          if (!isOAuthSignup && acceptTerms !== true) {
            throw new APIError("BAD_REQUEST", {
              message: 'You must accept the Terms of Service and Privacy Policy to register.',
            });
          }
          
          return {
            data: {
              ...user,
              name: userDisplayName, // Ensure name is set (from OAuth profile or request body)
              username: finalUsername ? finalUsername.toLowerCase() : null,
              password_hash: password ? await bcrypt.hash(password, 10) : null,
            },
          };
        },
        after: async (user, ctx) => {
          // Write DOB and policy acceptance fields for email/password signups
          const { dateOfBirth, acceptTerms } = ctx.body || {};
          const isOAuthSignup = ctx.path === '/callback/:id' || ctx.path?.includes('/callback/');
          
          // Only write these fields for email/password signups (OAuth signups use complete-profile flow)
          if (!isOAuthSignup && (dateOfBirth || acceptTerms)) {
            // Get client IP address for policy acceptance tracking
            // Try multiple ways to access headers/request
            let clientIp = null;
            if (ctx.headers) {
              clientIp = ctx.headers['x-forwarded-for'] || ctx.headers['x-real-ip'];
            } else if (ctx.request?.headers) {
              clientIp = ctx.request.headers['x-forwarded-for'] || ctx.request.headers['x-real-ip'];
            } else if (ctx.request?.connection) {
              clientIp = ctx.request.connection.remoteAddress || 
                        ctx.request.socket?.remoteAddress ||
                        (ctx.request.connection.socket ? ctx.request.connection.socket.remoteAddress : null);
            }
            
            // Extract first IP if x-forwarded-for contains multiple IPs
            if (clientIp && clientIp.includes(',')) {
              clientIp = clientIp.split(',')[0].trim();
            }
            
            const currentTimestamp = new Date();
            const policyVersion = '1.0';
            
            // Build update query dynamically based on what's provided
            const updates = [];
            const values = [];
            let paramIndex = 1;
            
            if (dateOfBirth) {
              updates.push(`date_of_birth = $${paramIndex++}`);
              values.push(dateOfBirth);
            }
            
            if (acceptTerms) {
              updates.push(`terms_accepted = $${paramIndex++}`);
              updates.push(`privacy_policy_accepted = $${paramIndex++}`);
              updates.push(`policy_accepted_at = $${paramIndex++}`);
              updates.push(`policy_accepted_ip = $${paramIndex++}`);
              updates.push(`policy_version = $${paramIndex++}`);
              values.push(true, true, currentTimestamp, clientIp, policyVersion);
            }
            
            if (updates.length > 0) {
              values.push(user.id);
              await pool.query(
                `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
                values
              );
            }
          }
          
          return { data: user };
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Custom cookie capture for OAuth callbacks before Better Auth strips them
      const isOAuthCallback = ctx.path?.includes('/callback/');
      if (isOAuthCallback) {
        console.log('🎣 CUSTOM OAUTH MIDDLEWARE: Capturing cookies for callback');

        // Try to capture cookies from various sources before Better Auth processes them
        let capturedCookies = null;

        // Try Hono context if available (this might work in some setups)
        try {
          // @ts-ignore - Try to access Hono context
          if (globalThis?.c?.req?.header) {
            const cookieHeader = globalThis.c.req.header('cookie') || globalThis.c.req.header('Cookie');
            if (cookieHeader) {
              capturedCookies = cookieHeader;
              console.log('🎣 CAPTURED COOKIES VIA HONO CONTEXT:', capturedCookies.substring(0, 100) + '...');
            }
          }
        } catch (e) {
          // Ignore errors
        }

        // Store captured cookies in a global variable for later use
        if (capturedCookies) {
          // @ts-ignore
          globalThis._oauthCookies = capturedCookies;
        }
      }

      console.log('🔐 BEFORE HOOK EXECUTED:');
      console.log('  - Path:', ctx.path);
      console.log('  - Method:', ctx.method);

      // Enhanced OAuth state debugging for callback requests
      if (isOAuthCallback) {
        console.log('🔑 OAUTH CALLBACK DEBUG:');
        console.log('  - State from query:', ctx.query?.state);
        console.log('  - Code from query:', ctx.query?.code ? '[PRESENT]' : '[NOT PRESENT]');
        console.log('  - Scope from query:', ctx.query?.scope);
        console.log('  - Auth user from query:', ctx.query?.authuser);

        // Log all available headers for debugging
        console.log('  - All headers keys:', Object.keys(ctx.headers || {}));
        console.log('  - Raw headers object:', JSON.stringify(ctx.headers, null, 2));

        // Check for cookies in different possible locations
        let cookieString = null;
        if (ctx.headers?.cookie) {
          cookieString = ctx.headers.cookie;
        } else if (ctx.headers?.['Cookie']) {
          cookieString = ctx.headers['Cookie'];
        } else if (ctx.request?.headers?.cookie) {
          cookieString = ctx.request.headers.cookie;
        } else if (ctx.request?.headers?.['Cookie']) {
          cookieString = ctx.request.headers['Cookie'];
        } else if (ctx.request?.raw?.headers?.get) {
          // Try Hono's raw request headers
          cookieString = ctx.request.raw.headers.get('cookie') || ctx.request.raw.headers.get('Cookie');
        } else if (globalThis._oauthCookies) {
          // Try globally captured cookies from custom middleware
          cookieString = globalThis._oauthCookies;
          console.log('🎣 USING GLOBALLY CAPTURED COOKIES');
        }

        // Additional debug for request object structure
        console.log('  - ctx.request exists:', !!ctx.request);
        if (ctx.request) {
          console.log('  - ctx.request keys:', Object.keys(ctx.request));
          if (ctx.request.raw) {
            console.log('  - ctx.request.raw exists, has headers.get:', typeof ctx.request.raw.headers?.get);
          }
        }
        console.log('  - globalThis._oauthCookies exists:', !!globalThis._oauthCookies);

        console.log('  - Cookie string found:', !!cookieString);
        if (cookieString) {
          console.log('  - Raw cookie string:', cookieString);
          const cookies = cookieString.split(';').map(c => c.trim());
          console.log('  - Parsed cookies count:', cookies.length);
          console.log('  - Cookie names:', cookies.map(c => c.split('=')[0]));

          const stateCookie = cookies.find(c => c.startsWith('__Secure-better-auth.state='));
          const sessionCookie = cookies.find(c => c.startsWith('__Secure-better-auth.session_token='));

          if (stateCookie) {
            const stateValue = stateCookie.split('=')[1];
            console.log('  - State cookie present:', !!stateValue);
            console.log('  - State cookie length:', stateValue?.length || 0);
            if (stateValue) {
              console.log('  - State cookie prefix:', stateValue.substring(0, 10) + '...');
              console.log('  - State cookie suffix:', '...' + stateValue.substring(stateValue.length - 10));
            }
          } else {
            console.log('  - State cookie: NOT FOUND');
          }

          if (sessionCookie) {
            const tokenValue = sessionCookie.split('=')[1];
            console.log('  - Session token present:', !!tokenValue);
            console.log('  - Session token length:', tokenValue?.length || 0);
            if (tokenValue) {
              console.log('  - Session token prefix:', tokenValue.substring(0, 10) + '...');
              console.log('  - Session token suffix:', '...' + tokenValue.substring(tokenValue.length - 10));
            }
          } else {
            console.log('  - Session token: NOT FOUND');
          }
        } else {
          console.log('  - No cookies found in any location');
        }

        console.log('  - User-Agent:', ctx.headers?.['user-agent'] || ctx.headers?.['User-Agent']);
        console.log('  - Referer:', ctx.headers?.referer || ctx.headers?.['Referer']);
      }

      try {
        // Intercept OAuth error page redirects and redirect to UI instead
        if (ctx.path === '/error' || ctx.path === '/api/auth/error') {
          const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const loginUrl = `${frontendUrl}/login`;
        
        // Map Better Auth error codes to client-safe messages
        const errorMessages = {
          'please_restart_the_process': 'Please restart the sign-up process. The OAuth session may have expired.',
          'invalid_callback_request': 'Invalid OAuth callback. Please try signing in again.',
          'state_not_found': 'OAuth session expired. Please try signing in again.',
          'no_code': 'OAuth authorization failed. Please try signing in again.',
          'no_callback_url': 'OAuth callback URL missing. Please try signing in again.',
          'oauth_provider_not_found': 'OAuth provider not found. Please try signing in again.',
          'unable_to_get_user_info': 'Unable to retrieve user information from Google. Please try again.',
          'state_mismatch': 'OAuth state mismatch. Please try signing in again.',
          'email_already_registered': 'This email is already registered. Please sign in instead.',
          'email_is_already_registered': 'This email is already registered. Please sign in instead.',
        };
        
        // Get error code from query params
        const errorCode = ctx.query?.error || 'unknown_error';
        
        // Get client-safe error message
        const clientMessage = errorMessages[errorCode] || 'An error occurred during sign-up. Please try again.';
        
        // Redirect to login page with error message
        throw ctx.redirect(`${loginUrl}?error=${encodeURIComponent(clientMessage)}&errorType=oauth`);
        }

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
      } catch (hookError) {
        console.error('❌ BEFORE HOOK ERROR:', hookError);
        throw hookError;
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      console.log('🔐 AFTER HOOK EXECUTED:');
      console.log('  - Path:', ctx.path);
      console.log('  - Method:', ctx.method);

      try {
        // Check for OAuth callback errors and redirect to UI with client-safe error message
        const isOAuthCallback = ctx.path?.includes('/callback/');

        if (isOAuthCallback) {
          console.log('🔑 OAUTH CALLBACK AFTER DEBUG:');
          const returned = ctx.context.returned;
          console.log('  - Returned status:', returned?.status);
          console.log('  - Returned body type:', typeof returned?.body);
          console.log('  - Returned headers:', returned?.headers ? '[PRESENT]' : '[NOT PRESENT]');

          // Log returned body safely (avoid logging sensitive data)
          if (returned?.body) {
            if (typeof returned.body === 'object') {
              console.log('  - Returned body keys:', Object.keys(returned.body));
              // Log error details if present
              if (returned.body.error) {
                console.log('  - Returned error:', returned.body.error);
              }
              if (returned.body.message) {
                console.log('  - Returned message:', returned.body.message);
              }
            } else {
              console.log('  - Returned body:', returned.body);
            }
          }

        // If returned is an APIError or error response, handle it
        if (returned && (returned.status && returned.status >= 400)) {
          console.log('❌ OAUTH CALLBACK ERROR DETECTED:');
          console.log('  - Error status:', returned.status);
          console.log('  - Error body:', returned.body);
          const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
          const loginUrl = `${frontendUrl}/login`;
          
          // Map Better Auth error codes to client-safe messages
          const errorMessages = {
            'please_restart_the_process': 'Please restart the sign-up process. The OAuth session may have expired.',
            'invalid_callback_request': 'Invalid OAuth callback. Please try signing in again.',
            'state_not_found': 'OAuth session expired. Please try signing in again.',
            'no_code': 'OAuth authorization failed. Please try signing in again.',
            'no_callback_url': 'OAuth callback URL missing. Please try signing in again.',
            'oauth_provider_not_found': 'OAuth provider not found. Please try signing in again.',
            'unable_to_get_user_info': 'Unable to retrieve user information from Google. Please try again.',
            'state_mismatch': 'OAuth state mismatch. Please try signing in again.',
            'email_already_registered': 'This email is already registered. Please sign in instead.',
            'email_is_already_registered': 'This email is already registered. Please sign in instead.',
          };
          
          // Extract error code from error message or query params
          let errorCode = 'unknown_error';
          if (returned instanceof APIError) {
            errorCode = returned.message || 'unknown_error';
          } else if (returned.error) {
            errorCode = returned.error;
          } else if (ctx.query?.error) {
            errorCode = ctx.query.error;
          }
          
          // Extract error code from error message if it's in the format "error=code"
          if (typeof errorCode === 'string' && errorCode.includes('error=')) {
            const match = errorCode.match(/error=([^&]+)/);
            if (match) {
              errorCode = match[1];
            }
          }
          
          // Get client-safe error message
          const clientMessage = errorMessages[errorCode] || 'An error occurred during sign-up. Please try again.';
          
          // Redirect to login page with error message
          throw ctx.redirect(`${loginUrl}?error=${encodeURIComponent(clientMessage)}&errorType=oauth`);
        }
        }
      } catch (hookError) {
        console.error('❌ AFTER HOOK ERROR:', hookError);
        throw hookError;
      }
    }),
  },
  plugins: [
    customSession(async ({ user, session }, ctx) => {
      // Get user fields from database if not present in user object
      let dateOfBirth = user.date_of_birth;
      let termsAccepted = user.terms_accepted;
      let privacyPolicyAccepted = user.privacy_policy_accepted;
      
      // If fields are missing, query the database
      if (!dateOfBirth || termsAccepted === undefined || privacyPolicyAccepted === undefined) {
        try {
          const result = await pool.query(
            'SELECT date_of_birth, terms_accepted, privacy_policy_accepted FROM users WHERE id = $1',
            [user.id]
          );
          
          if (result.rows.length > 0) {
            dateOfBirth = dateOfBirth || result.rows[0].date_of_birth;
            termsAccepted = termsAccepted !== undefined ? termsAccepted : result.rows[0].terms_accepted;
            privacyPolicyAccepted = privacyPolicyAccepted !== undefined ? privacyPolicyAccepted : result.rows[0].privacy_policy_accepted;
          }
        } catch (error) {
          console.error('Error fetching user profile fields:', error);
        }
      }
      
      // Check if profile is completed: DOB and both policy accepted fields must be filled
      const profileCompleted = !!(
        dateOfBirth && 
        termsAccepted && 
        privacyPolicyAccepted
      );
      
      return {
        profile_completed: profileCompleted,
        user,
        session,
      };
    }),
  ]
});