// Server-side fetch of a gym's own website <head> metadata (theme-color,
// og:image, favicon) so an owner's public iGym page can echo their brand
// identity. Runs server-side because the target site's CORS policy would
// otherwise block a browser fetch — and because scraping an arbitrary URL
// server-side, with a timeout, is the same trust boundary already used for
// the AI proxy routes.
import { NextResponse } from 'next/server';
import { parseBrandingFromHtml } from '@shared/branding';

export const runtime = 'nodejs';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const url = (body?.url || '').trim();
  if (!url) return NextResponse.json({ error: 'Missing website URL.' }, { status: 400 });

  let parsed;
  try {
    parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad protocol');
  } catch {
    return NextResponse.json({ error: 'That doesn\'t look like a valid website URL.' }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; iGymBrandingSync/1.0)' },
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Website returned ${res.status} — couldn't read its branding.` }, { status: 502 });
    }
    const html = await res.text();
    const branding = parseBrandingFromHtml(html, parsed.toString());

    if (!branding.primaryColor && !branding.logoUrl && !branding.heroImageUrl) {
      return NextResponse.json({ error: "Couldn't find any brand colors or images on that site." }, { status: 422 });
    }
    return NextResponse.json(branding);
  } catch (err) {
    const timedOut = err.name === 'AbortError';
    return NextResponse.json(
      { error: timedOut ? 'That website took too long to respond.' : "Couldn't reach that website." },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
