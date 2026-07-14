// Server-side proxy for the AI gym matchmaker. Keeps the Anthropic key off
// the client — the browser only ever sees the prompt and the JSON result.
import { NextResponse } from 'next/server';
import { matchmakerSearch, AIError } from '@shared/ai';

export const runtime = 'nodejs';

export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI search is not configured on this server yet.' },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const prompt = (body?.prompt || '').trim();
  const gyms = Array.isArray(body?.gyms) ? body.gyms : [];
  const previousTurn = body?.previousTurn?.prompt ? body.previousTurn : null;
  if (!prompt) return NextResponse.json({ error: 'Missing search prompt.' }, { status: 400 });

  try {
    const result = await matchmakerSearch({ apiKey, prompt, gyms, previousTurn });
    return NextResponse.json(result);
  } catch (err) {
    const status = err instanceof AIError ? err.status || 502 : 500;
    return NextResponse.json({ error: err.message || 'AI search failed.' }, { status });
  }
}
