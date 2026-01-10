import { betterAuth } from "better-auth";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pool = require('./src/config/db.cjs');



export const auth5 = betterAuth({
  database: pool,
  // baseURL: 'https://kxdwjea5mk.execute-api.us-east-2.amazonaws.com/test/test/api/auth',
  basePath: '/test/api/auth',
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
    },
  },
  emailAndPassword: {
    enabled: true,
    // requireEmailVerification: true, // Require email verification before login
    // sendResetPassword: sendResetPassword,
  },
  // emailVerification: {
  //   sendVerificationEmail: sendVerificationEmail,
  //   sendOnSignUp: true, // Automatically send verification email on signup
  //   sendOnSignIn: false, // Disable automatic resend on login attempts
  //   autoSignInAfterVerification: true, // Auto sign in after verification
  //   expiresIn: 86400, // 24 hours in seconds
  // },
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
    // additionalFields: {
		// 	username: {
		// 		type: "string",
		// 		required: false,
		// 	},
    //   password_hash: { // temp, can be removed after migration
    //     type: "string",
    //     required: false,
    //   },
    //   date_of_birth: {
    //     type: "date",
    //     required: false,
    //     input: false, // Don't allow user to set this directly during signup
    //   },
    //   terms_accepted: {
    //     type: "boolean",
    //     required: false,
    //     input: false, // Don't allow user to set this directly during signup
    //   },
    //   privacy_policy_accepted: {
    //     type: "boolean",
    //     required: false,
    //     input: false, // Don't allow user to set this directly during signup
    //   },
		// },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          return {
            data: {
              ...user,
              name: 'sdfgsd', // Ensure name is set (from OAuth profile or request body)
              username: 'sadflkj234' + Math.random().toString(36).substring(2, 15)
            },
          };
        },
      },
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
      partitioned: true // New browser standards will mandate this for foreign cookies
    }
  }
});