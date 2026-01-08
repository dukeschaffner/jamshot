import { betterAuth } from "better-auth";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pool = require('./src/config/db.cjs');
const bcrypt = require('bcryptjs');

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