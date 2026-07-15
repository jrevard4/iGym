// Server-side proxy for the AI equipment photo identifier. Keeps the
// Anthropic key off the client — same pattern as app/api/matchmaker/route.js.
import { NextResponse } from 'next/server';
import { identifyEquipmentFromImage, AIError } from '@shared/ai';

export const runtime = 'nodejs';

export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI equipment scanning is not configured on this server yet.' },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const base64 = body?.base64;
  const mediaType = body?.mediaType || 'image/jpeg';
  if (!base64) return NextResponse.json({ error: 'Missing image data.' }, { status: 400 });

  try {
    const result = await identifyEquipmentFromImage({ apiKey, base64, mediaType });
    return NextResponse.json(result);
  } catch (err) {
    const status = err instanceof AIError ? err.status || 502 : 500;
    return NextResponse.json({ error: err.message || 'AI scan failed.' }, { status });
  }
}
