// Checks the platform-operator password server-side so it never ships to the
// browser bundle — mirrors app/api/matchmaker's "secret stays server-only"
// posture, just for a password instead of an API key.
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request) {
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  if (!ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Admin login is not configured on this deployment.' }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if ((body?.password || '') !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
