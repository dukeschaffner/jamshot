---
name: sign-up-and-login
description: Headed-browser test of Sterio email/password signup (verify + login) and Google OAuth signup (complete profile, sign out, sign back in). Use when testing auth, signup, login, OAuth, or email verification locally.
---

# Sign up and login

Prove the auth flows against the **ephemeral** stack with a **headed** browser so a human can finish Google if needed.

## Before anything else

Read and follow [ephemeral-testing](../ephemeral-testing/SKILL.md). Do not touch `jamshot` / `sterio-dev`.

Do **not** seed `x-dev-user-id`. This test uses real Better Auth cookies in the browser.

Copy this checklist:

```
- [ ] Ephemeral overlay + schema + wipe (see ephemeral-testing)
- [ ] jamshot backend on :5001/:5002 stopped
- [ ] Backend: JAMSHOT_ENV=ephemeral npm run dev:backend
- [ ] Logs show [dev-env] ephemeral overlay
- [ ] UI on :3000 (JAMSHOT_ENV=ephemeral npm run dev --workspace=ui)
- [ ] Headed Chromium (Playwright headless: false, or any headed browser you can drive)
- [ ] Email/pass: register → verify URL from logs → /feed → logout → login
- [ ] OAuth: Continue with Google → human finishes Google → complete profile → logout → Google again
- [ ] npm run ephemeral:wipe
```

If `dev:backend` dies because Stripe cannot chmod its config, restart it outside the sandbox (full OS permissions). Auth does not need Stripe, but the runner treats any service exit as fatal.

## Browser

Drive a **headed** Chromium window. Playwright:

```js
const browser = await chromium.launch({ headless: false, slowMo: 50 });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
```

Keep **one** browser context for the whole run (email/pass then OAuth) so Google can stay signed in for the second OAuth click.

Dismiss the Next.js dev overlay before every interaction. It intercepts clicks/fills even when only the "1 Issue" badge is showing:

```js
await page.evaluate(() => {
  document.querySelectorAll('nextjs-portal').forEach((el) => el.remove());
});
```

Prefer `{ force: true }` on fills/clicks if an overlay comes back. `getByRole('button', { name: /continue with google/i })` does **not** match this UI; use the has-text locator below.

Use unique creds every run:

- username: `ephsu` + short timestamp, letters/numbers/underscores only, max 20, not `me`
- name: `Eph Test`
- email: `eph-su-<stamp>@example.com`
- password: `EphTest1!` (8+, upper, lower, number, special)
- date of birth: `1990-06-15` (`#dateOfBirth` is `type=date`; fill `YYYY-MM-DD`)

App URLs: UI `http://localhost:3000`, Better Auth `http://localhost:5002/api/auth`.

## Email / password

1. `http://localhost:3000/register` (heading **Sign Up**). Same form as `/login` → **Sign up**.
2. Fill `#username`, `#name`, `#dateOfBirth`, `#email`, `#password`, `#confirmPassword`. Check `#acceptTerms`. Click **Create Account**.
3. Wait for heading **Verify Your Email**.
4. Get the confirm link from API logs (inbox is not usable — `TEST_EMAIL` redirects outbound mail):

   Grep `[DEV EMAIL] verification url for <email>:`

   - MCP `get_local_logs` with `sources: ["API"]`, `limit` 200+, or
   - `curl -s 'http://127.0.0.1:5099/logs?sources=API&limit=500'`

   Example line:

   `[DEV EMAIL] verification url for eph-su-….@example.com: http://localhost:5002/api/auth/verify-email?token=…&callbackURL=http://localhost:3000/`

   If the line is missing, the API was started before `logDevEmailLink` existed — restart ephemeral backend. The token is a JWT; it is **not** in the `verification` table.
5. Navigate the same page to that URL. It redirects to `/`.
6. `autoSignInAfterVerification` is on. `/` is the marketing shell (no Logout). Wait up to ~10s for AppChrome to `replace` **`/feed`**. Logged-in check: URL `/feed` **and** `button[title="Logout"]`.
7. Click **Logout**. Wait for `/login`.
8. Fill `#email` / `#password`, click **Login** (`getByRole('button', { name: /^login$/i })`). Expect `/feed` + Logout.

Pass = verify link activates the account and a fresh email/pass login reaches `/feed`.

## Google OAuth

Google's UI cannot be automated here. The agent clicks through Sterio; the **user completes Google** in the headed window.

1. From `/register` or `/login`, click:

   `page.locator('button', { hasText: 'Continue with Google' })` with `{ force: true }`.
2. Wait until the hostname is `accounts.google.com`. Do **not** `waitUntil: 'load'` — Google often never fires `load`. Match the URL or use `domcontentloaded`.
3. **Stop and ask the user** to finish Google sign-in / account picker in that window. Wait until the URL is back on `localhost:3000`.
4. New Google user → **Complete Your Profile** (`h1`). Fill `#dateOfBirth`, check `#acceptTerms`, click **Complete Profile**. Expect `/feed` + Logout.
5. Click **Logout**. Wait for `/login`.
6. **Continue with Google** again (same context). User may need one more click if Google does not auto-continue. Expect `/feed` **without** Complete Profile.

`disableImplicitSignUp` is on; `/login` and `/register` pass `requestSignUp: true`. Use a Google account that is not already in this ephemeral DB (wipe first). Redirect URI is `http://localhost:5002/api/auth/callback/google`.

If the UI returns to `/login?errorCode=…`, OAuth failed — read API logs, do not invent a workaround.

## After

```bash
npm run ephemeral:wipe
```

Stop the ephemeral backend and start `npm run dev:backend` (no `JAMSHOT_ENV`) to return to jamshot.
