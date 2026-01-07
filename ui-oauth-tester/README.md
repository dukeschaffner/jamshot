# Google OAuth Tester

A simple React app for testing Google OAuth functionality with the Jamshot API.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure the API URL (optional):
   - Copy `.env.example` to `.env` if you need to change the default API URL
   - Default API URL: `http://localhost:5001`

3. Start the development server:
```bash
npm run dev
```

## Usage

1. Make sure your API server is running and configured with Google OAuth credentials
2. Open the app in your browser (usually `http://localhost:5173`)
3. Click "Sign in with Google" to test the OAuth flow
4. View your session information after successful authentication
5. Use "Sign Out" to test logout functionality

## Features

- Test Google OAuth sign-in flow
- View current session status
- Display user information from authenticated session
- Test sign-out functionality
- Configurable API URL

## API Endpoints Used

- `GET /api/auth/session` - Get current session
- `GET /api/auth/sign-in/google` - Initiate Google OAuth
- `POST /api/auth/sign-out` - Sign out

## Requirements

- Node.js 18+ 
- Running Jamshot API server with Google OAuth configured
- Google OAuth credentials configured in the API environment variables:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
