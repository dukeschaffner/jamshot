import { NextResponse } from 'next/server';

/**
 * Public short-link redirect: sterio.fm/r/{code}
 * Records the click via API and redirects to Sterio with UTM + oc params.
 */
export async function GET(request, { params }) {
  const { code } = await params;

  if (!code || typeof code !== 'string') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const apiBase = (
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    'http://localhost:5001/api'
  ).replace(/\/$/, '');

  const headers = {
    'Content-Type': 'application/json',
  };

  const forwardedFor = request.headers.get('x-forwarded-for');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  const cfIpCity = request.headers.get('cf-ipcity');
  const cfRegionCode = request.headers.get('cf-region-code');
  const cfIpCountry = request.headers.get('cf-ipcountry');
  const cfRegion = request.headers.get('cf-region');
  const userAgent = request.headers.get('user-agent');
  const referer = request.headers.get('referer');

  if (cfConnectingIp) headers['cf-connecting-ip'] = cfConnectingIp;
  if (cfIpCity) headers['cf-ipcity'] = cfIpCity;
  if (cfRegionCode) headers['cf-region-code'] = cfRegionCode;
  if (cfIpCountry) headers['cf-ipcountry'] = cfIpCountry;
  if (cfRegion) headers['cf-region'] = cfRegion;
  if (forwardedFor) headers['x-forwarded-for'] = forwardedFor;
  if (userAgent) headers['user-agent'] = userAgent;
  if (referer) headers['referer'] = referer;

  // Forward Amplify/Cloudflare secret if present so API accepts the call
  const cfSecret = process.env.CF_SECRET;
  if (cfSecret) {
    headers['x-internal-auth'] = cfSecret;
  }

  try {
    const response = await fetch(`${apiBase}/outreach/r/${encodeURIComponent(code)}/click`, {
      method: 'POST',
      headers,
    });

    if (response.ok) {
      const data = await response.json();
      if (data.redirectUrl) {
        return NextResponse.redirect(data.redirectUrl);
      }
    }
  } catch (error) {
    console.error('Outreach click resolve failed:', error);
  }

  return NextResponse.redirect(new URL('/', request.url));
}
