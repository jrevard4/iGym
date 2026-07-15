// Server-side proxy for the AI workout generator. Keeps the Anthropic key
// off the client — same pattern as the other /api/* AI routes.
import { NextResponse } from 'next/server';
import { generateWorkoutPlan, AIError } from '@shared/ai';

export const runtime = 'nodejs';

export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI workout generation is not configured on this server yet.' },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const gym = body?.gym;
  const muscleGroups = Array.isArray(body?.muscleGroups) ? body.muscleGroups : [];
  const goal = body?.goal || '';
  const experienceLevel = body?.experienceLevel || '';
  if (!gym) return NextResponse.json({ error: 'Missing gym.' }, { status: 400 });

  try {
    const result = await generateWorkoutPlan({ apiKey, gym, muscleGroups, goal, experienceLevel });
    return NextResponse.json(result);
  } catch (err) {
    const status = err instanceof AIError ? err.status || 502 : 500;
    return NextResponse.json({ error: err.message || 'Workout generation failed.' }, { status });
  }
}
