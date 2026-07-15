import {
  getDistanceMiles, isOpenNow, getActivePromotion, runLocalMatch,
  computeCheckinStats, parseClaudeJSON, computeEquipmentAlerts, computeCheckinHeatmap,
  parseCityState, citySlug,
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

describe('computeEquipmentAlerts', () => {
  const now = new Date('2026-07-15T00:00:00.000Z');

  it('returns no alerts for equipment with no dates', () => {
    expect(computeEquipmentAlerts([{ id: 'e1', name: 'Rack' }], now)).toEqual([]);
  });

  it('flags a warranty expiring within 30 days', () => {
    const eq = [{ id: 'e1', name: 'Treadmill', warrantyExpiresDate: '2026-07-30' }];
    const alerts = computeEquipmentAlerts(eq, now);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('warranty_expiring');
  });

  it('flags an already-expired warranty', () => {
    const eq = [{ id: 'e1', name: 'Treadmill', warrantyExpiresDate: '2026-01-01' }];
    const alerts = computeEquipmentAlerts(eq, now);
    expect(alerts[0].type).toBe('warranty_expired');
  });

  it('does not flag a warranty far in the future', () => {
    const eq = [{ id: 'e1', name: 'Treadmill', warrantyExpiresDate: '2030-01-01' }];
    expect(computeEquipmentAlerts(eq, now)).toEqual([]);
  });

  it('flags an out-of-service item past its expected repair date', () => {
    const eq = [{ id: 'e1', name: 'Bike', outOfService: true, expectedRepairDate: '2026-07-01' }];
    const alerts = computeEquipmentAlerts(eq, now);
    expect(alerts[0].type).toBe('repair_overdue');
  });

  it('does not flag out-of-service equipment with a future repair date', () => {
    const eq = [{ id: 'e1', name: 'Bike', outOfService: true, expectedRepairDate: '2026-08-01' }];
    expect(computeEquipmentAlerts(eq, now)).toEqual([]);
  });
});

describe('computeCheckinHeatmap', () => {
  it('returns an empty grid and no peak for no check-ins', () => {
    const { peak, peakLabel, byHour } = computeCheckinHeatmap([]);
    expect(peak).toBeNull();
    expect(peakLabel).toBeNull();
    expect(byHour).toEqual(Array(24).fill(0));
  });

  it('finds the peak day/hour across check-ins', () => {
    // Saturday 2026-07-18 at 18:00 UTC, twice; one Monday check-in elsewhere
    const checkins = [
      { created_at: '2026-07-18T18:00:00.000Z' },
      { created_at: '2026-07-18T18:30:00.000Z' },
      { created_at: '2026-07-13T09:00:00.000Z' },
    ];
    const { peak, peakLabel } = computeCheckinHeatmap(checkins);
    expect(peak.count).toBe(2);
    expect(peakLabel).toMatch(/around/);
  });
});

describe('parseCityState', () => {
  it('extracts city and state from a full street address', () => {
    expect(parseCityState('123 Muscle Way, Columbus, OH')).toEqual({ city: 'Columbus', state: 'OH' });
  });

  it('strips a trailing zip code off the state segment', () => {
    expect(parseCityState('123 Muscle Way, Columbus, OH 43215')).toEqual({ city: 'Columbus', state: 'OH' });
  });

  it('returns null for an address with too few parts', () => {
    expect(parseCityState('Columbus')).toBeNull();
    expect(parseCityState('')).toBeNull();
    expect(parseCityState(null)).toBeNull();
  });
});

describe('citySlug', () => {
  it('builds a lowercase hyphenated slug', () => {
    expect(citySlug('Columbus', 'OH')).toBe('columbus-oh');
  });

  it('replaces non-alphanumeric characters in multi-word city names', () => {
    expect(citySlug('New York', 'NY')).toBe('new-york-ny');
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
