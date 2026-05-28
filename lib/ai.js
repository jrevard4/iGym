// Centralized Anthropic API calls. All Claude requests funnel through callClaude()
// so we can swap models, add retries, or add request caching in one place.

import { CLAUDE_MODEL } from './constants';
import { parseClaudeJSON } from './helpers';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

class AIError extends Error {
  constructor(message, status) { super(message); this.name = 'AIError'; this.status = status; }
}

async function callClaude({ apiKey, system, messages, maxTokens = 1500, tools }) {
  if (!apiKey) throw new AIError('Missing Anthropic API key');

  const body = {
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    messages,
  };
  if (system) body.system = system;
  if (tools)  body.tools  = tools;

  let res;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    throw new AIError(`Network error: ${networkErr.message}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AIError(`API ${res.status}: ${text.slice(0, 200)}`, res.status);
  }

  const data = await res.json();
  const fullText = (data.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  return { raw: fullText, json: parseClaudeJSON(fullText) };
}

// ─── 1. Gym matchmaker ────────────────────────────────────────────────
export async function matchmakerSearch({ apiKey, prompt, gyms }) {
  const gymSummaries = gyms.map(g => ({
    id:           g.id,
    name:         g.gymName,
    description:  g.description || '',
    classes:      g.classes || [],
    equipment:    (g.equipment || []).map(e => `${e.name} (${e.category || 'general'}, targets: ${e.targetArea || 'general'})`),
    pricing:      g.pricing || '',
    monthlyPrice: g.monthlyPrice || 0,
    hoursDisplay: g.hoursDisplay || '',
  }));

  const { json } = await callClaude({
    apiKey,
    maxTokens: 1200,
    system: `You are iGym's AI fitness concierge — expert at understanding workout goals and matching people to the perfect gym. Be specific, warm, and concise. Always reference actual equipment or classes when explaining matches.`,
    messages: [{
      role: 'user',
      content: `A member is looking for: "${prompt}"

Available gyms:
${JSON.stringify(gymSummaries, null, 2)}

Respond ONLY with valid JSON (no markdown fences). Structure:
{
  "matches": [
    {
      "gymId": "string",
      "score": <0-100 integer>,
      "reason": "<2-3 sentences explaining why this gym fits their specific goal>",
      "highlights": ["<specific feature 1>", "<specific feature 2>", "<specific feature 3>"]
    }
  ],
  "suggestions": ["<follow-up search idea 1>", "<follow-up search idea 2>", "<follow-up search idea 3>"],
  "summary": "<1 sentence telling the member what you found for them>"
}

Rules:
- Only include gyms with score ≥ 20
- Sort matches by score descending
- highlights should be 2-4 concrete, specific things
- suggestions should be diverse follow-up prompts the user could try
- If no gyms match well, return empty matches array and a helpful summary`,
    }],
  });

  if (!json) throw new AIError('Could not parse matchmaker response');
  return json; // { matches, suggestions, summary }
}

// ─── 2. Equipment photo identifier ────────────────────────────────────
export async function identifyEquipmentFromImage({ apiKey, base64, mediaType }) {
  const { json } = await callClaude({
    apiKey,
    maxTokens: 2000,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    system: 'You are a professional gym equipment expert and certified strength & conditioning coach. You identify gym equipment from photos with precision, research detailed manufacturer specifications using web search, and provide thorough workout programming guidance. Always respond with valid JSON and no markdown fences.',
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        {
          type: 'text',
          text: `Identify the gym equipment in this photo. Use web search to find the exact model specifications, proper usage instructions, and workout applications.

Return ONLY a valid JSON object — no markdown fences — with this exact structure:
{
  "name": "Full brand and model name if identifiable",
  "brand": "Manufacturer name, or 'Unknown'",
  "category": "Exactly one of: Machine | Cable | Free Weight | Cardio",
  "targetArea": "Specific primary muscle groups",
  "minWeight": "Minimum resistance in lbs as a string ('0' for bodyweight)",
  "maxWeight": "Maximum weight capacity in lbs as a string",
  "instructions": "Numbered step-by-step usage instructions. 4-6 steps.",
  "workouts": ["Workout Name: sets/reps and technique.", "..."],
  "maintenance": "2-3 bullet-point maintenance and safety checks.",
  "description": "2-3 sentences about this equipment.",
  "confidence": "high | medium | low"
}`,
        },
      ],
    }],
  });

  if (!json) throw new AIError('Could not parse identification response');
  return json;
}

// ─── 3. Equipment web search by query ─────────────────────────────────
export async function searchEquipmentOnWeb({ apiKey, query, brand }) {
  const brandHint = brand && brand !== 'All' ? `Focus on ${brand} equipment.` : '';

  const { json } = await callClaude({
    apiKey,
    maxTokens: 2000,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    system: 'You are a commercial gym equipment expert. Search the web to find specific gym equipment matching the query. Return accurate, detailed specifications gym owners can use to manage their inventory. Always respond with valid JSON and no markdown fences.',
    messages: [{
      role: 'user',
      content: `Search for gym equipment matching: "${query}". ${brandHint}

Use web search to find real commercial gym equipment products. Return 3-6 results.

Respond ONLY with valid JSON (no markdown fences):
{
  "results": [
    {
      "name": "Full product name including model number if known",
      "brand": "Manufacturer brand name",
      "category": "Machine | Cable | Free Weight | Cardio",
      "targetArea": "Primary muscle groups targeted",
      "minWeight": "Minimum weight/resistance as string ('0' if N/A)",
      "maxWeight": "Maximum weight capacity as string",
      "instructions": "2-3 sentence usage guide",
      "description": "1-2 sentences about benefits"
    }
  ]
}

Rules:
- Only include real commercial gym equipment products
- Be specific with model names where possible
- Keep instructions practical and clear`,
    }],
  });

  if (!json) throw new AIError('Could not parse search response');
  return json.results || [];
}

export { AIError };
