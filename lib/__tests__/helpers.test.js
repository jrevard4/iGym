import {
  getDistanceMiles, isOpenNow, getActivePromotion, runLocalMatch,
  computeCheckinStats, parseClaudeJSON,
} from '../helpers';

describe('getDistanceMiles', () => {
  it('returns 0 for identical coordinates', () => {
    expect(getDistanceMiles(40, -83, 40, -83)).toBeCloseTo(0);
  });

  it('returns a sentinel when any coordinate is missing', () => {
    expect(getDistanceMiles(null, -83, 40, -83)).toBe(9999);
  });

  it('computes a plausible distance between two real points', () => {
    // Columbus, OH -> Cleveland, OH is roughly 140 miles
    const miles = getDistanceMiles(39.9612, -82.9988, 41.4993, -81.6944);
    expect(miles).toBeGreaterThan(120);
    expect(miles).toBeLessThan(160);
  });
});

describe('isOpenNow', () => {
  it('returns null when hours are unknown', () => {
    expect(isOpenNow({})).toBeNull();
  });

  it('returns true for a 24/7 gym', () => {
    expect(isOpenNow({ openHour: 0, closeHour: 0 })).toBe(true);
  });
});

describe('getActivePromotion', () => {
  it('returns null when there are no promotions', () => {
    expect(getActivePromotion({})).toBeNull();
  });

  it('finds a promotion within its date range', () => {
    const promo = { id: 'p1', title: 'Sale', startDate: null, endDate: null };
    expect(getActivePromotion({ promotions: [promo] })).toEqual(promo);
  });

  it('excludes an expired promotion', () => {
    const promo = { id: 'p1', title: 'Sale', endDate: '2000-01-01T00:00:00.000Z' };
    expect(getActivePromotion({ promotions: [promo] })).toBeNull();
  });
});

describe('runLocalMatch', () => {
  const gyms = [
    { id: 'g1', gymName: 'Iron Paradise', description: 'Heavy lifting and squat racks', classes: ['HIIT'], equipment: [{ name: 'Squat Rack', targetArea: 'Legs', category: 'Free Weight' }], monthlyPrice: 60, pricing: '$60/mo' },
    { id: 'g2', gymName: 'Budget Fit', description: 'Affordable cardio gym', classes: ['Cycling'], equipment: [], monthlyPrice: 20, pricing: '$20/mo' },
  ];

  it('scores a gym higher when the prompt matches its equipment', () => {
    const results = runLocalMatch('I want to squat', gyms);
    expect(results.g1.score).toBeGreaterThan(0);
  });

  it('gives a budget boost to cheap gyms when the prompt mentions cost', () => {
    const results = runLocalMatch('cheap gym', gyms);
    expect(results.g2).toBeDefined();
  });

  it('returns no match for an unrelated gym', () => {
    const results = runLocalMatch('squat', gyms);
    expect(results.g2).toBeUndefined();
  });
});

describe('computeCheckinStats', () => {
  const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString();

  it('returns zeroed stats for no check-ins', () => {
    expect(computeCheckinStats([])).toEqual({ totalVisits: 0, currentStreak: 0, longestStreak: 0, badges: [] });
  });

  it('computes a streak for consecutive days ending today', () => {
    const checkins = [{ created_at: day(0) }, { created_at: day(-1) }, { created_at: day(-2) }];
    const stats = computeCheckinStats(checkins);
    expect(stats.currentStreak).toBe(3);
    expect(stats.totalVisits).toBe(3);
  });

  it('breaks the streak on a gap day', () => {
    const checkins = [{ created_at: day(0) }, { created_at: day(-2) }];
    const stats = computeCheckinStats(checkins);
    expect(stats.currentStreak).toBe(1);
  });

  it('awards the first badge at 5 visits', () => {
    const checkins = Array.from({ length: 5 }, (_, i) => ({ created_at: day(-i) }));
    const stats = computeCheckinStats(checkins);
    expect(stats.badges.map((b) => b.label)).toContain('First Steps');
  });
});

describe('parseClaudeJSON', () => {
  it('parses plain JSON', () => {
    expect(parseClaudeJSON('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips markdown fences', () => {
    expect(parseClaudeJSON('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('returns null for invalid input', () => {
    expect(parseClaudeJSON('not json')).toBeNull();
    expect(parseClaudeJSON(null)).toBeNull();
  });
});
