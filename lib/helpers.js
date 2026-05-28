// Pure helper functions. No React Native imports — safe to use from Next.js too.

export function getDistanceMiles(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 9999;
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function getAvgRating(reviews = []) {
  if (!reviews.length) return 0;
  return reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length;
}

export function renderStars(rating) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  let s = '';
  for (let i = 0; i < 5; i++) {
    if (i < full) s += '★';
    else if (i === full && half) s += '½';
    else s += '☆';
  }
  return s;
}

// Returns true / false / null (null = hours unknown). 24/7 gyms encode as openHour=0, closeHour=0.
export function isOpenNow(gym) {
  if (gym?.openHour == null || gym?.closeHour == null) return null;
  if (gym.openHour === 0 && gym.closeHour === 0) return true;
  const h = new Date().getHours();
  // Handle wrap-around (e.g. open 5 → close 0 means 5am til midnight)
  if (gym.closeHour <= gym.openHour) {
    return h >= gym.openHour || h < gym.closeHour;
  }
  return h >= gym.openHour && h < gym.closeHour;
}

// Local fallback when the user hasn't supplied an Anthropic API key.
export function getAIMatchScore(gym, prompt) {
  if (!prompt) return 0;
  const lp = prompt.toLowerCase();
  let score = 0;
  if (gym.description?.toLowerCase().includes(lp)) score += 50;
  gym.classes?.forEach(cls => { if (lp.includes(cls.toLowerCase())) score += 30; });
  gym.equipment?.forEach(eq => {
    if (eq.name && lp.includes(eq.name.toLowerCase())) score += 40;
    if (eq.targetArea && lp.includes(eq.targetArea.toLowerCase())) score += 20;
  });
  if (gym.gymName?.toLowerCase().includes(lp)) score += 20;
  return score;
}

// Richer local match used when prompt is multi-word.
export function runLocalMatch(prompt, gyms) {
  const lp = (prompt || '').toLowerCase();
  const keywords = lp.split(/\s+/).filter(w => w.length > 2);
  const results = {};

  gyms.forEach(gym => {
    let score = 0;
    const highlights = [];

    if (gym.description?.toLowerCase().includes(lp)) { score += 40; }

    (gym.classes || []).forEach(cls => {
      if (keywords.some(kw => cls.toLowerCase().includes(kw) || kw.includes(cls.toLowerCase()))) {
        score += 30;
        highlights.push(`${cls} classes`);
      }
    });

    (gym.equipment || []).forEach(eq => {
      keywords.forEach(kw => {
        if (eq.name?.toLowerCase().includes(kw))       { score += 35; highlights.push(eq.name); }
        if (eq.targetArea?.toLowerCase().includes(kw)) { score += 20; highlights.push(`${eq.targetArea} training`); }
        if (eq.category?.toLowerCase().includes(kw))   { score += 15; }
      });
    });

    if (keywords.some(kw => ['cheap','affordable','budget','inexpensive'].includes(kw)) && gym.monthlyPrice < 40) {
      score += 25; highlights.push(`Budget-friendly at ${gym.pricing}`);
    }

    if (score > 0) {
      const unique = [...new Set(highlights)].slice(0, 3);
      results[gym.id] = {
        score: Math.min(score, 99),
        reason: unique.length > 0
          ? `This gym offers ${unique.join(', ')} which aligns with your goal.`
          : 'This gym may match based on its overall offerings.',
        highlights: unique,
      };
    }
  });

  return results;
}

// Stable enough ID generator without depending on crypto.randomUUID
// (RN Hermes engine still lacks it on some versions).
export function uniqueId(prefix = '') {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// Strip Claude's occasional ```json fences before JSON.parse.
export function parseClaudeJSON(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/^```json\s*/m, '')
    .replace(/^```\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim();
  try { return JSON.parse(cleaned); }
  catch { return null; }
}
