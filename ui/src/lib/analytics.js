// Google Analytics utility functions

export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

// Initialize Google Analytics
export const initGA = () => {
  if (typeof window !== 'undefined' && GA_MEASUREMENT_ID) {
    // Check if gtag is already loaded
    if (window.gtag) return;
    
    // Load gtag script
    const script1 = document.createElement('script');
    script1.async = true;
    script1.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(script1);

    // Initialize gtag
    const script2 = document.createElement('script');
    script2.innerHTML = `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${GA_MEASUREMENT_ID}', {
        page_title: document.title,
        page_location: window.location.href,
      });
    `;
    document.head.appendChild(script2);
  }
};

// Track page views
export const trackPageView = (url, title) => {
  if (typeof window !== 'undefined' && window.gtag && GA_MEASUREMENT_ID) {
    window.gtag('config', GA_MEASUREMENT_ID, {
      page_title: title,
      page_location: url,
    });
  }
};

// Track custom events
export const trackEvent = (action, category, label, value) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', action, {
      event_category: category,
      event_label: label,
      value: value,
    });
  }
};

// Specific tracking functions for sterio app
export const trackTrackPlay = (trackId, trackTitle, username) => {
  trackEvent('play_track', 'audio', `${trackTitle} by ${username}`, trackId);
};

export const trackTrackPause = (trackId, trackTitle, username) => {
  trackEvent('pause_track', 'audio', `${trackTitle} by ${username}`, trackId);
};

export const trackTrackExpand = (trackId, trackTitle, username) => {
  trackEvent('expand_track', 'engagement', `${trackTitle} by ${username}`, trackId);
};

export const trackTrackUpload = (trackTitle) => {
  trackEvent('upload_track', 'content_creation', trackTitle);
};

export const trackCollaboration = (trackId, trackTitle) => {
  trackEvent('add_collaboration', 'content_creation', trackTitle, trackId);
};

export const trackUserFollow = (username) => {
  trackEvent('follow_user', 'social', username);
};

export const trackUserUnfollow = (username) => {
  trackEvent('unfollow_user', 'social', username);
};

export const trackFeedChange = (feedType) => {
  trackEvent('change_feed', 'navigation', feedType);
};

export const trackSearch = (searchTerm) => {
  trackEvent('search', 'engagement', searchTerm);
};

export const trackWelcomeDialogClose = () => {
  trackEvent('close_welcome_dialog', 'onboarding', 'first_visit');
};

export const trackLike = (trackId, trackTitle, username) => {
  trackEvent('like_track', 'engagement', `${trackTitle} by ${username}`, trackId);
};

export const trackUnlike = (trackId, trackTitle, username) => {
  trackEvent('unlike_track', 'engagement', `${trackTitle} by ${username}`, trackId);
};

export const trackComment = (trackId, trackTitle, username) => {
  trackEvent('comment_on_track', 'engagement', `${trackTitle} by ${username}`, trackId);
};

export const trackShare = (trackId, trackTitle, username) => {
  trackEvent('share_track', 'social', `${trackTitle} by ${username}`, trackId);
}; 