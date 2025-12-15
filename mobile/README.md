# Jamshot Mobile App

React Native mobile app built with Expo for the Jamshot music collaboration platform.

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

3. Run on iOS simulator:
```bash
npm run ios
```

4. Run on Android emulator:
```bash
npm run android
```

## Project Structure

```
mobile/
├── app/                    # Expo Router app directory
│   ├── (tabs)/            # Tab navigation screens
│   │   ├── index.js      # Home feed screen
│   │   ├── search.js     # Search screen (placeholder)
│   │   ├── record.js     # Record screen (placeholder)
│   │   └── profile.js    # Profile screen (placeholder)
│   └── _layout.js        # Root layout
├── components/            # Reusable components
│   ├── Track.js          # Track component
│   └── TrackMeta.js       # Track metadata component
├── lib/                   # Utilities and helpers
│   └── api.js            # API client setup
└── shared/                # Shared code with web app
    ├── api/              # API client factory
    ├── types/            # Type definitions
    └── utils/            # Utility functions
```

## Features

- **Home Feed**: Browse tracks from Following or Popular feeds
- **Track Component**: Display track info with play/pause, likes, reposts, and collabs
- **Navigation**: Bottom tab navigation (Home, Search, Record, Profile)

## Environment Variables

Create a `.env` file in the mobile directory:

```
EXPO_PUBLIC_API_URL=https://your-api-url.com/api
```

## Development Notes

- Uses Expo Router for file-based routing
- API client is shared with web app via `shared/api`
- Styling follows the web app's design system (seafoam green, rustic pink)
- Placeholder screens are ready for future implementation



