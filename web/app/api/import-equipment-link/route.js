// Server-side proxy for drag-and-drop equipment import: an owner drags a
// product link from a supplier's website onto the inventory page, the
// browser hands us the URL, and this route fetches + parses that page's
// metadata — same trust-boundary reasoning as /api/sync-branding.
import { NextResponse } from 'next/server';
import { parseProductFromHtml } from '@shared/productImport';

export const runtime = 'nodejs';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const url = (body?.url || '').trim();
  if (!url) return NextResponse.json({ error: 'Missing product URL.' }, { status: 400 });

  let parsed;
  try {
    parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad protocol');
  } catch {
    return NextResponse.json({ error: "That doesn't look like a valid link." }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; iGymEquipmentImport/1.0)' },
    });
    if (!res.ok) {
      return NextResponse.json({ error: `That page returned ${res.status} — couldn't read it.` }, { status: 502 });
    }
    const html = await res.text();
    const product = parseProductFromHtml(html, parsed.toString());

    if (!product.name && !product.imageUrl) {
      return NextResponse.json({ error: "Couldn't find product info on that page." }, { status: 422 });
    }
    return NextResponse.json(product);
  } catch (err) {
    const timedOut = err.name === 'AbortError';
    return NextResponse.json(
      { error: timedOut ? 'That page took too long to respond.' : "Couldn't reach that link." },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
