# Google Analytics Implementation for Sterio

This document outlines the Google Analytics (GA4) implementation added to the Sterio music collaboration platform.

## Overview

Google Analytics has been integrated to track user interactions, page views, and key engagement metrics across the platform. The implementation follows Next.js best practices and includes comprehensive event tracking for music-related activities.

## Setup Instructions

### 1. Get Your Google Analytics Measurement ID

1. Go to [Google Analytics](https://analytics.google.com/)
2. Create a new GA4 property for your website
3. Copy your Measurement ID (format: `G-XXXXXXXXXX`)

### 2. Configure Environment Variables

Add your Google Analytics Measurement ID to both environment files:

**`.env.local` (for development):**
```
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

**`.env.production` (for production):**
```
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

Replace `G-XXXXXXXXXX` with your actual Measurement ID.

### 3. Verify Implementation

The Google Analytics tracking is automatically initialized when the app loads. You can verify it's working by:

1. Starting your development server: `npm run dev`
2. Opening your browser's developer tools
3. Checking the Network tab for requests to `googletagmanager.com`
4. Viewing real-time data in your Google Analytics dashboard

## Tracked Events

The implementation tracks the following events:

### Audio Events
- **play_track**: When a user plays a track
- **pause_track**: When a user pauses a track
- **expand_track**: When a user expands a track to view collaborations

### Content Creation Events
- **upload_track**: When a user uploads a new track
- **add_collaboration**: When a user adds a collaboration to an existing track

### Social Events
- **follow_user**: When a user follows another user
- **unfollow_user**: When a user unfollows another user
- **share_track**: When a user copies a track link for sharing

### Engagement Events
- **like_track**: When a user likes a track
- **unlike_track**: When a user unlikes a track
- **comment_on_track**: When a user comments on a track
- **search**: When a user performs a search

### Navigation Events
- **change_feed**: When a user switches between feed types (For You, Following, Popular)

### Onboarding Events
- **close_welcome_dialog**: When a first-time user closes the welcome dialog

## Implementation Details

### Files Modified

1. **`ui/src/lib/analytics.js`** - Core analytics utilities and event tracking functions
2. **`ui/src/app/layout.js`** - GA initialization and page view tracking
3. **`ui/src/app/page.js`** - Home page event tracking
4. **`ui/src/components/Track.js`** - Track interaction event tracking
5. **`ui/src/components/DAW/UploadForm.js`** - Upload event tracking
6. **`ui/src/app/search/SearchClient.js`** - Search and follow event tracking
7. **`ui/.env.local`** - Development environment configuration
8. **`ui/.env.production`** - Production environment configuration

### Key Functions

- `initGA()`: Initializes Google Analytics
- `trackPageView()`: Tracks page navigation
- `trackEvent()`: Generic event tracking function
- Specific tracking functions for each user action

### Privacy Considerations

- All tracking respects user privacy and follows GDPR guidelines
- No personally identifiable information (PII) is sent to Google Analytics
- Users can disable tracking through browser settings or ad blockers

## Customization

To add new event tracking:

1. Add a new function to `ui/src/lib/analytics.js`:
```javascript
export const trackNewEvent = (parameter) => {
  trackEvent('new_event', 'category', parameter);
};
```

2. Import and call the function where the event occurs:
```javascript
import { trackNewEvent } from '../lib/analytics';

// In your component
const handleAction = () => {
  trackNewEvent('parameter_value');
  // Your existing logic
};
```

## Monitoring and Reporting

Once implemented, you can monitor the following metrics in Google Analytics:

- **User Engagement**: Track play rates, likes, and shares
- **Content Performance**: See which tracks get the most interactions
- **User Journey**: Understand how users navigate through the app
- **Feature Usage**: Monitor adoption of collaboration features
- **Search Behavior**: Analyze what users are searching for

## Troubleshooting

### Common Issues

1. **Events not showing in GA**: 
   - Check that your Measurement ID is correct
   - Verify the ID is set in the environment variables
   - Events may take 24-48 hours to appear in reports

2. **Build errors**:
   - Ensure all imports are correct
   - Check that window object checks are in place for SSR compatibility

3. **Tracking not working in development**:
   - GA events work in development but may be filtered in some GA views
   - Use the real-time reports to verify events are being sent

### Debug Mode

To enable debug mode, you can modify the GA initialization in `analytics.js`:

```javascript
gtag('config', '${GA_MEASUREMENT_ID}', {
  debug_mode: true,
  page_title: document.title,
  page_location: window.location.href,
});
```

This will provide detailed logging in the browser console.

## Next Steps

1. Set up custom dashboards in Google Analytics for music-specific metrics
2. Configure conversion goals for key actions (uploads, collaborations)
3. Set up automated reports for stakeholders
4. Consider implementing Google Analytics Enhanced Ecommerce if monetization features are added

## Support

For questions about this implementation, refer to:
- [Google Analytics documentation](https://developers.google.com/analytics/devguides/collection/ga4)
- [Next.js analytics documentation](https://nextjs.org/docs/app/building-your-application/optimizing/analytics) 