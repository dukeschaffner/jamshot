import posthog from 'posthog-js';

function isPosthogConfigured() {
  return typeof window !== 'undefined' && !!process.env.NEXT_PUBLIC_POSTHOG_TOKEN;
}

export function deriveSiteSection(pathname) {
  if (!pathname) return 'unknown';
  if (pathname === '/') return 'home_feed';
  if (pathname.startsWith('/track/')) return 'track_page';
  if (pathname.startsWith('/user/')) return 'user_profile';
  if (pathname.startsWith('/search')) return 'search';
  if (pathname.startsWith('/explore')) return 'explore';
  if (pathname.startsWith('/featured')) return 'featured';
  if (pathname.startsWith('/tree2/')) return 'tree2';
  if (pathname.startsWith('/tree/')) return 'tree';
  if (pathname.startsWith('/camp/')) return 'camp';
  if (pathname.startsWith('/team/')) return 'team';
  if (pathname.startsWith('/competition/')) return 'competition';
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/login')) return 'login';
  return 'other';
}

export function deriveDiscoveryMethod(pathname) {
  if (!pathname) return 'unknown';
  if (pathname === '/') return 'home_feed';
  if (pathname.startsWith('/user/')) return 'user_page';
  if (pathname.startsWith('/track/')) return 'track_page';
  if (pathname.startsWith('/search')) return 'search';
  if (pathname.startsWith('/explore')) return 'explore_page';
  if (pathname.startsWith('/featured')) return 'featured_page';
  if (pathname.startsWith('/tree/') || pathname.startsWith('/tree2/')) return 'tree_page';
  if (pathname.startsWith('/camp/')) return 'camp_page';
  if (pathname.startsWith('/team/')) return 'team_page';
  if (pathname.startsWith('/competition/')) return 'competition_page';
  return 'unknown';
}

function capture(event, props) {
  if (!isPosthogConfigured()) return;
  try {
    posthog.capture(event, props);
  } catch {
    // ignore analytics errors
  }
}

export function identifySterioUser(user) {
  if (!isPosthogConfigured() || !user?.id) return;
  try {
    posthog.identify(String(user.id), {
      email: user.email,
      name: user.name,
      username: user.username,
    });
  } catch {
    // ignore
  }
}

export function resetSterioPosthog() {
  if (!isPosthogConfigured()) return;
  try {
    posthog.reset();
  } catch {
    // ignore
  }
}

export function captureTrackSurfaceViewed(payload) {
  capture('track_or_minitrack_viewed', payload);
}

export function captureTrackPlayPressed(payload) {
  capture('track_or_minitrack_play_pressed', payload);
}

export function captureTrackPageOpened(payload) {
  capture('track_page_opened', payload);
}

export function captureDawRecordStarted(payload) {
  capture('daw_record_started', payload);
}

export function captureDawUploadFormOpened(payload) {
  capture('daw_upload_form_opened', payload);
}

export function captureDawUploadSubmitted(payload) {
  capture('daw_upload_submitted', payload);
}
