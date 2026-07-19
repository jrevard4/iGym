import {
  getDistanceMiles, isOpenNow, getActivePromotion, runLocalMatch,
  computeCheckinStats, parseClaudeJSON, computeEquipmentAlerts, computeCheckinHeatmap,
  parseCityState, citySlug, stripHtmlToText, extractKeywords, findSimilarGyms, buildWorkoutICS,
  isSectionVisible, getUpcomingClassOccurrences, countBookedForOccurrence, computePlatformStats,
  computeRecurringRevenueStats,
} from '../helpers';

describe('computeRecurringRevenueStats', () => {
  it('returns zeroed stats for no passes', () => {
    expect(computeRecurringRevenueStats([])).toEqual({
      mrr: 0, activeCount: 0, pastDueCount: 0, canceledCount: 0, pastDue: [],
    });
  });

  it('ignores one-time TIME/PUNCH passes with no stripeSubscriptionId', () => {
    const passes = [
      { type: 'TIME', price: 15, value: '7' },
      { type: 'PUNCH', price: 120, value: '10' },
    ];
    expect(computeRecurringRevenueStats(passes).activeCount).toBe(0);
  });

  it('sums active subscriptions into MRR, normalizing non-30-day billing periods', () => {
    const passes = [
      { stripeSubscriptionId: 'sub_1', status: 'active', price: 30, value: '30' }, // $30/mo as-is
      { stripeSubscriptionId: 'sub_2', status: 'active', price: 7, value: '7' },   // $7/week -> ~$30/mo
    ];
    const stats = computeRecurringRevenueStats(passes);
    expect(stats.activeCount).toBe(2);
    expect(stats.mrr).toBeCloseTo(60, 0);
  });

  it('treats a subscription with no status field as active (pre-webhook default)', () => {
    const passes = [{ stripeSubscriptionId: 'sub_1', price: 20, value: '30' }];
    expect(computeRecurringRevenueStats(passes).activeCount).toBe(1);
  });

  it('separates past_due and canceled subscriptions out of MRR', () => {
    const passes = [
      { stripeSubscriptionId: 'sub_1', status: 'active', price: 30, value: '30' },
      { stripeSubscriptionId: 'sub_2', status: 'past_due', price: 25, value: '30' },
      { stripeSubscriptionId: 'sub_3', status: 'canceled', price: 40, value: '30' },
    ];
    const stats = computeRecurringRevenueStats(passes);
    expect(stats.mrr).toBe(30);
    expect(stats.pastDueCount).toBe(1);
    expect(stats.canceledCount).toBe(1);
    expect(stats.pastDue).toHaveLength(1);
    expect(stats.pastDue[0].stripeSubscriptionId).toBe('sub_2');
  });
});

describe('getUpcomingClassOccurrences', () => {
  const now = new Date('2026-07-16T12:00:00'); // a Thursday (dayOfWeek 4)

  it('returns nothing when the gym has no class schedule', () => {
    expect(getUpcomingClassOccurrences({}, 2, now)).toEqual([]);
  });

  it('expands a weekly template into concrete dated occurrences within the window', () => {
    const gym = { classSchedule: [{ id: 'c1', className: 'Yoga', dayOfWeek: 4, startTime: '06:00', capacity: 10 }] };
    const occurrences = getUpcomingClassOccurrences(gym, 2, now);
    // 2 weeks ahead should catch today's Thursday plus one more Thursday
    expect(occurrences.length).toBe(2);
    expect(occurrences[0].classDate).toBe('2026-07-16');
    expect(occurrences[1].classDate).toBe('2026-07-23');
    expect(occurrences[0].className).toBe('Yoga');
  });

  it('sorts multiple classes by date then start time', () => {
    const gym = {
      classSchedule: [
        { id: 'c1', className: 'Evening HIIT', dayOfWeek: 4, startTime: '18:00' },
        { id: 'c2', className: 'Morning Yoga', dayOfWeek: 4, startTime: '06:00' },
      ],
    };
    const occurrences = getUpcomingClassOccurrences(gym, 1, now);
    expect(occurrences[0].className).toBe('Morning Yoga');
    expect(occurrences[1].className).toBe('Evening HIIT');
  });
});

describe('countBookedForOccurrence', () => {
  const bookings = [
    { classScheduleId: 'c1', classDate: '2026-07-16', status: 'booked' },
    { classScheduleId: 'c1', classDate: '2026-07-16', status: 'booked' },
    { classScheduleId: 'c1', classDate: '2026-07-16', status: 'cancelled' },
    { classScheduleId: 'c1', classDate: '2026-07-23', status: 'booked' },
    { classScheduleId: 'c2', classDate: '2026-07-16', status: 'booked' },
  ];

  it('counts only booked (not cancelled/waitlisted) rows for the exact occurrence', () => {
    expect(countBookedForOccurrence(bookings, 'c1', '2026-07-16')).toBe(2);
  });

  it('returns 0 for an occurrence with no bookings', () => {
    expect(countBookedForOccurrence(bookings, 'c3', '2026-07-16')).toBe(0);
  });
});

describe('computePlatformStats', () => {
  it('aggregates revenue, fees, reviews, and top gyms across the platform', () => {
    const gyms = [
      { id: 'g1', totalPassRevenue: 100, platformFeesPaid: 12, gymReviews: [{ id: 'r1' }] },
      { id: 'g2', totalPassRevenue: 300, platformFeesPaid: 36, gymReviews: [] },
    ];
    const users = [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }];
    const stats = computePlatformStats(gyms, users);
    expect(stats.totalGyms).toBe(2);
    expect(stats.totalMembers).toBe(3);
    expect(stats.totalRevenue).toBe(400);
    expect(stats.totalPlatformFees).toBe(48);
    expect(stats.totalReviews).toBe(1);
    expect(stats.topGymsByRevenue[0].id).toBe('g2');
  });

  it('handles an empty platform without throwing', () => {
    expect(computePlatformStats([], [])).toEqual({
      totalGyms: 0, totalMembers: 0, totalRevenue: 0, totalPlatformFees: 0, totalReviews: 0, topGymsByRevenue: [],
    });
  });
});

describe('isSectionVisible', () => {
  it('defaults to visible when the gym has no pageSettings at all', () => {
    expect(isSectionVisible({}, 'showEquipment')).toBe(true);
  });

  it('respects an explicit false override', () => {
    expect(isSectionVisible({ pageSettings: { showEquipment: false } }, 'showEquipment')).toBe(false);
  });

  it('respects an explicit true override', () => {
    expect(isSectionVisible({ pageSettings: { showWorkoutGenerator: true } }, 'showWorkoutGenerator')).toBe(true);
  });

  it('falls back to the section default for an unknown key', () => {
    expect(isSectionVisible({ pageSettings: {} }, 'showEquipment')).toBe(true);
  });
});

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

  it('matches on auto-extracted site keywords the owner never manually tagged', () => {
    const withKeywords = [{ id: 'g3', gymName: 'Zen Studio', description: '', classes: [], equipment: [], siteKeywords: ['Sauna', 'Steam Room'], monthlyPrice: 50, pricing: '$50/mo' }];
    const results = runLocalMatch('does it have a sauna', withKeywords);
    expect(results.g3).toBeDefined();
    expect(results.g3.highlights).toContain('Sauna');
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

  it('flags equipment with a member-submitted report, using the most recent note', () => {
    const eq = [{ id: 'e1', name: 'Rowing Machine', memberReports: [{ id: 'r2', note: 'Chain is loose' }, { id: 'r1', note: 'Squeaky seat' }] }];
    const alerts = computeEquipmentAlerts(eq, now);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('member_reported');
    expect(alerts[0].message).toContain('Chain is loose');
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

describe('stripHtmlToText', () => {
  it('removes script and style content, not just tags', () => {
    const html = '<html><head><style>.a{color:red}</style></head><body><script>alert(1)</script><p>Hello world</p></body></html>';
    const text = stripHtmlToText(html);
    expect(text).toBe('Hello world');
  });

  it('collapses whitespace and decodes basic entities', () => {
    expect(stripHtmlToText('<p>Fit  &amp;   Strong</p>')).toBe('Fit & Strong');
  });

  it('returns an empty string for empty input', () => {
    expect(stripHtmlToText('')).toBe('');
  });
});

describe('extractKeywords', () => {
  it('finds vocabulary terms case-insensitively', () => {
    const text = 'We offer yoga, HIIT classes, and a full sauna.';
    const keywords = extractKeywords(text);
    expect(keywords).toContain('Yoga');
    expect(keywords).toContain('HIIT');
    expect(keywords).toContain('Sauna');
  });

  it('does not include vocabulary terms absent from the text', () => {
    const keywords = extractKeywords('Just a plain gym with some machines.');
    expect(keywords).not.toContain('Yoga');
  });

  it('returns an empty array for empty text', () => {
    expect(extractKeywords('')).toEqual([]);
  });
});

describe('findSimilarGyms', () => {
  const target = { id: 'g1', classes: ['Yoga', 'HIIT'], amenities: ['Sauna'], location: '1 Main St, Columbus, OH', equipment: [{ category: 'Free Weight' }] };
  const gyms = [
    target,
    { id: 'g2', classes: ['Yoga'], amenities: [], location: '2 Elm St, Columbus, OH', equipment: [] }, // shares class + city
    { id: 'g3', classes: [], amenities: [], location: '9 Far Ave, Denver, CO', equipment: [] }, // unrelated
    { id: 'g4', classes: ['Yoga', 'HIIT'], amenities: ['Sauna'], location: '3 Oak St, Columbus, OH', equipment: [{ category: 'Free Weight' }] }, // strong match
  ];

  it('excludes the gym itself', () => {
    const results = findSimilarGyms(target, gyms);
    expect(results.find((g) => g.id === 'g1')).toBeUndefined();
  });

  it('ranks a strongly overlapping gym above a weakly related one', () => {
    const results = findSimilarGyms(target, gyms);
    expect(results[0].id).toBe('g4');
  });

  it('excludes gyms with no overlap at all', () => {
    const results = findSimilarGyms(target, gyms);
    expect(results.find((g) => g.id === 'g3')).toBeUndefined();
  });

  it('returns an empty array when gym is null', () => {
    expect(findSimilarGyms(null, gyms)).toEqual([]);
  });
});

describe('buildWorkoutICS', () => {
  const workout = {
    id: 'wk_1', title: 'Leg Day',
    exercises: [{ name: 'Back Squat', sets: 4, reps: '8-10', equipment: 'Squat Rack' }],
  };
  const start = new Date('2026-07-20T07:00:00.000Z');

  it('produces a valid VCALENDAR/VEVENT block', () => {
    const ics = buildWorkoutICS(workout, start);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('includes the workout title and exercise list', () => {
    const ics = buildWorkoutICS(workout, start);
    expect(ics).toContain('SUMMARY:Leg Day');
    expect(ics).toContain('Back Squat');
  });

  it('sets DTSTART based on the given start date', () => {
    const ics = buildWorkoutICS(workout, start);
    expect(ics).toContain('DTSTART:20260720T070000Z');
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
