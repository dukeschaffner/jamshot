import posthog from 'posthog-js';

function isPosthogConfigured() {
  return typeof window !== 'undefined' && !!process.env.NEXT_PUBLIC_POSTHOG_TOKEN;
}

export function deriveSiteSection(pathname) {
  if (!pathname) return 'unknown';
  if (pathname === '/') return 'marketing_home';
  if (pathname === '/feed') return 'home_feed';
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
  if (pathname === '/') return 'marketing_home';
  if (pathname === '/feed') return 'home_feed';
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

export function captureAuthLoginSucceeded(payload) {
  capture('auth_login_succeeded', payload);
}

export function captureAuthLoginFailed(payload) {
  capture('auth_login_failed', payload);
}

export function captureAuthSignupSucceeded(payload) {
  capture('auth_signup_succeeded', payload);
}

export function captureAuthSignupFailed(payload) {
  capture('auth_signup_failed', payload);
}

export function captureAuthGoogleStarted() {
  capture('auth_google_oauth_started', {});
}

export function captureAuthProfileCompleted() {
  capture('auth_profile_completed', {});
}

export function captureAuthLogout() {
  capture('auth_logout', {});
}

export function captureTrackLinkCopied(payload) {
  capture('track_link_copied', payload);
}

export function captureDawAudioFileImported(payload) {
  capture('daw_audio_file_imported', payload);
}

export function captureDawLeaveUnsavedConfirmed(payload) {
  capture('daw_leave_unsaved_confirmed', payload);
}
