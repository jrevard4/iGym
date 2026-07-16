// Automated gym-site indexer: fetches a gym's own website and scans it for
// known gym-relevant terms (classes, amenities, equipment types), so the
// gym becomes findable by things it never manually tagged. No AI/API key
// involved — a fixed vocabulary match — so it runs uniformly for every gym
// with a website on file, at zero per-request cost. Triggered automatically
// from the owner Profile page whenever the website field is saved (see
// web/app/owner/profile/page.js), not just on manual request.
import { NextResponse } from 'next/server';
import { stripHtmlToText, extractKeywords } from '@shared/helpers';

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
    return NextResponse.json({ error: "That doesn't look like a valid website URL." }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; iGymSiteIndexer/1.0)' },
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Website returned ${res.status}.` }, { status: 502 });
    }
    const html = await res.text();
    const text = stripHtmlToText(html);
    const keywords = extractKeywords(text);
    return NextResponse.json({ keywords });
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
