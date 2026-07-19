// Server-side proxy to Nominatim (OpenStreetMap's free geocoder — no API key,
// consistent with the Leaflet/OSM map already used in components/GymMap.js).
// Proxying (rather than calling Nominatim directly from the browser) lets us
// set the descriptive User-Agent their usage policy requires and keeps
// query construction/country restriction in one place.
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  if (!q) return NextResponse.json({ error: 'Missing search query.' }, { status: 400 });

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'us,ca,mx');

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'iGym/1.0 (gym-finder app; contact via app support)' },
    });
    if (!res.ok) throw new Error(`Nominatim returned ${res.status}`);
    const results = await res.json();
    if (!results.length) {
      return NextResponse.json({ error: 'Could not find that city. Try a different spelling or add a state/province.' }, { status: 404 });
    }
    const top = results[0];
    return NextResponse.json({
      lat: parseFloat(top.lat),
      lon: parseFloat(top.lon),
      displayName: top.display_name,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Location search is temporarily unavailable.' }, { status: 502 });
  }
}
