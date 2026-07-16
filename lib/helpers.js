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

    // Auto-extracted from the gym's own website (see /api/sync-keywords) —
    // catches things owners never manually tagged as a class or amenity.
    (gym.siteKeywords || []).forEach(term => {
      if (keywords.some(kw => term.toLowerCase().includes(kw) || kw.includes(term.toLowerCase()))) {
        score += 15;
        highlights.push(term);
      }
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

// Returns the first currently-active promotion (by date range), or null.
// A promotion with no startDate/endDate is treated as always-on.
export function getActivePromotion(gym) {
  const promos = gym?.promotions || [];
  const now = new Date();
  return promos.find(p => {
    if (p.startDate && new Date(p.startDate) > now) return false;
    if (p.endDate && new Date(p.endDate) < now) return false;
    return true;
  }) || null;
}

const CHECKIN_BADGES = [
  { threshold: 5, label: 'First Steps' },
  { threshold: 25, label: 'Regular' },
  { threshold: 100, label: 'Centurion' },
];

const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

// Computes visit streak/badges from a list of {created_at} check-in rows.
// `now` is injectable for tests; defaults to the real current time.
export function computeCheckinStats(checkins = [], now = new Date()) {
  const totalVisits = checkins.length;
  const distinctDays = [...new Set(checkins.map(c => dayKey(c.created_at)))].sort().reverse();

  let currentStreak = 0;
  if (distinctDays.length > 0) {
    const today = dayKey(now);
    const yesterday = dayKey(new Date(now.getTime() - 86400000));
    if (distinctDays[0] === today || distinctDays[0] === yesterday) {
      currentStreak = 1;
      for (let i = 0; i < distinctDays.length - 1; i++) {
        const gapDays = (new Date(distinctDays[i]) - new Date(distinctDays[i + 1])) / 86400000;
        if (gapDays === 1) currentStreak++;
        else break;
      }
    }
  }

  let longestStreak = 0;
  if (distinctDays.length > 0) {
    const ascending = [...distinctDays].reverse();
    let run = 1;
    longestStreak = 1;
    for (let i = 1; i < ascending.length; i++) {
      const gapDays = (new Date(ascending[i]) - new Date(ascending[i - 1])) / 86400000;
      run = gapDays === 1 ? run + 1 : 1;
      longestStreak = Math.max(longestStreak, run);
    }
  }

  const badges = CHECKIN_BADGES.filter(b => totalVisits >= b.threshold);

  return { totalVisits, currentStreak, longestStreak, badges };
}

// Flags equipment needing owner attention: warranty expiring/expired, or a
// repair that's run past its expected date. `now` is injectable for tests.
export function computeEquipmentAlerts(equipment = [], now = new Date()) {
  const alerts = [];
  const WARN_WINDOW_DAYS = 30;

  equipment.forEach((eq) => {
    if (eq.warrantyExpiresDate) {
      const days = (new Date(eq.warrantyExpiresDate) - now) / 86400000;
      if (days < 0) {
        alerts.push({ id: eq.id, name: eq.name, type: 'warranty_expired', message: `${eq.name}: warranty expired` });
      } else if (days <= WARN_WINDOW_DAYS) {
        alerts.push({ id: eq.id, name: eq.name, type: 'warranty_expiring', message: `${eq.name}: warranty expires in ${Math.ceil(days)} day(s)` });
      }
    }
    if (eq.outOfService && eq.expectedRepairDate && new Date(eq.expectedRepairDate) < now) {
      alerts.push({ id: eq.id, name: eq.name, type: 'repair_overdue', message: `${eq.name}: repair is overdue` });
    }
    // Crowdsourced from members via reportEquipmentIssue — surfaces the most
    // recent report only, so one bad item doesn't spam the alert list.
    if ((eq.memberReports || []).length > 0) {
      const latest = eq.memberReports[0];
      alerts.push({ id: eq.id, name: eq.name, type: 'member_reported', message: `${eq.name}: reported by a member — "${latest.note}"` });
    }
  });

  return alerts;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Buckets check-in rows into a 7-day x 24-hour grid for a "busiest times"
// heatmap, plus a plain-language peak-time callout.
export function computeCheckinHeatmap(checkins = []) {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  const byHour = Array(24).fill(0);

  checkins.forEach((c) => {
    const d = new Date(c.created_at);
    const day = d.getDay();
    const hour = d.getHours();
    grid[day][hour]++;
    byHour[hour]++;
  });

  let peak = null;
  grid.forEach((hours, day) => {
    hours.forEach((count, hour) => {
      if (count > 0 && (!peak || count > peak.count)) peak = { day, hour, count };
    });
  });

  const peakLabel = peak && peak.count > 0
    ? `${DAY_NAMES[peak.day]}s around ${formatHour(peak.hour)}`
    : null;

  return { grid, byHour, peak, peakLabel };
}

function formatHour(h) {
  const period = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12} ${period}`;
}

// Best-effort city/state extraction from a free-text address like
// "123 Muscle Way, Columbus, OH" — powers the programmatic city SEO pages.
// Returns null when the address doesn't have enough comma-separated parts
// to confidently pull a city and state out of.
export function parseCityState(location) {
  if (!location) return null;
  const parts = location.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const city = parts[parts.length - 2];
  // State segment may carry a trailing zip ("OH 43215") — keep just the state.
  const state = parts[parts.length - 1].split(/\s+/)[0];
  if (!city || !state) return null;
  return { city, state };
}

export function citySlug(city, state) {
  return `${city.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${state.toLowerCase()}`;
}

// "You might also like" — scores other gyms by shared classes/amenities/
// equipment categories, with a bonus for being in the same city. Pure/local
// (no AI call), so it's cheap enough to compute on every gym-detail render.
export function findSimilarGyms(gym, allGyms, limit = 3) {
  if (!gym) return [];
  const classes = new Set(gym.classes || []);
  const amenities = new Set(gym.amenities || []);
  const categories = new Set((gym.equipment || []).map((eq) => eq.category).filter(Boolean));
  const cityState = parseCityState(gym.location);

  const scored = allGyms
    .filter((g) => g.id !== gym.id)
    .map((g) => {
      let score = 0;
      (g.classes || []).forEach((c) => { if (classes.has(c)) score += 2; });
      (g.amenities || []).forEach((a) => { if (amenities.has(a)) score += 2; });
      (g.equipment || []).forEach((eq) => { if (eq.category && categories.has(eq.category)) score += 1; });
      if (cityState) {
        const otherCityState = parseCityState(g.location);
        if (otherCityState && otherCityState.city === cityState.city && otherCityState.state === cityState.state) {
          score += 3;
        }
      }
      return { gym: g, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => s.gym);
}

// Strips a fetched HTML page down to plain, whitespace-collapsed text —
// drops script/style contents entirely (not just tags) so their code
// doesn't pollute keyword extraction, then removes remaining markup.
export function stripHtmlToText(html) {
  if (!html) return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// Vocabulary of gym-relevant terms an automated site crawl checks for —
// deliberately not AI-driven, so it works uniformly for every gym with a
// website on file, with no per-owner API key and no per-request cost.
export const GYM_KEYWORD_VOCABULARY = [
  'Yoga', 'HIIT', 'Cycling', 'Pilates', 'Boxing', 'Zumba', 'CrossFit', 'Spin',
  'Kickboxing', 'Martial Arts', 'MMA', 'Powerlifting', 'Olympic Lifting',
  'Bodybuilding', 'Functional Training', 'Group Fitness', 'Personal Training',
  'Strength Training', 'Cardio', 'Rock Climbing', 'Bouldering', 'CrossTraining',
  'Parking', 'Showers', 'Lockers', 'Sauna', 'Steam Room', 'Pool', 'Free WiFi',
  '24/7', '24 Hour', 'Childcare', 'Tanning', 'Juice Bar', 'Recovery',
  'Cryotherapy', 'Massage', 'Nutrition Coaching', 'Basketball Court', 'Turf',
  'Machine', 'Cable', 'Free Weight', 'Squat Rack', 'Smith Machine',
  'Wheelchair Accessible', 'Locker Rooms', 'Group Classes',
];

// Scans plain text (already run through stripHtmlToText) for occurrences of
// known gym-relevant terms — case-insensitive, whole-word-ish matching.
// Returns matched terms in their canonical vocabulary casing, deduplicated.
export function extractKeywords(text, vocabulary = GYM_KEYWORD_VOCABULARY) {
  if (!text) return [];
  const lower = text.toLowerCase();
  return vocabulary.filter((term) => lower.includes(term.toLowerCase()));
}

// Builds a minimal single-event .ics file for an AI-generated workout, so a
// member can drop it straight into their calendar app. `startDate` defaults
// to tomorrow at 7am local time — injectable for tests.
export function buildWorkoutICS(workout, startDate = null) {
  const start = startDate || (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(7, 0, 0, 0);
    return d;
  })();
  const end = new Date(start.getTime() + 45 * 60000);

  const stamp = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const escapeText = (s) => String(s || '').replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');

  const description = (workout.exercises || [])
    .map((ex, i) => `${i + 1}. ${ex.name} — ${ex.sets}x${ex.reps} (${ex.equipment})`)
    .join('\\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//iGym//Workout//EN',
    'BEGIN:VEVENT',
    `UID:${workout.id || uniqueId('wk_')}@igym.app`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escapeText(workout.title || 'iGym Workout')}`,
    `DESCRIPTION:${escapeText(description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
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
