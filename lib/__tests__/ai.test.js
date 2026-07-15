import { matchmakerSearch, generateWorkoutPlan, AIError } from '../ai';

const gym = { id: 'g1', gymName: 'Iron Paradise', description: '', classes: [], equipment: [], pricing: '$60/mo', monthlyPrice: 60, hoursDisplay: '' };

function mockClaudeResponse(bodyText) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ content: [{ type: 'text', text: bodyText }] }),
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('matchmakerSearch', () => {
  it('throws an AIError when no API key is provided', async () => {
    await expect(matchmakerSearch({ apiKey: '', prompt: 'legs', gyms: [gym] }))
      .rejects.toThrow(AIError);
  });

  it('parses a well-formed Claude response into matches/suggestions/summary', async () => {
    mockClaudeResponse(JSON.stringify({
      matches: [{ gymId: 'g1', score: 88, reason: 'Great fit', highlights: ['Squat racks'] }],
      suggestions: ['Something cheaper'],
      summary: 'Found a great match',
    }));

    const result = await matchmakerSearch({ apiKey: 'test-key', prompt: 'legs', gyms: [gym] });
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].gymId).toBe('g1');
    expect(result.summary).toBe('Found a great match');
  });

  it('includes prior-turn context in the request when refining', async () => {
    mockClaudeResponse(JSON.stringify({ matches: [], suggestions: [], summary: 'ok' }));

    await matchmakerSearch({
      apiKey: 'test-key',
      prompt: 'something cheaper',
      gyms: [gym],
      previousTurn: { prompt: 'legs', summary: 'Found a great match' },
    });

    const [, options] = global.fetch.mock.calls[0];
    const sentBody = JSON.parse(options.body);
    expect(sentBody.messages[0].content).toContain('legs');
    expect(sentBody.messages[0].content).toContain('refinement');
  });

  it('throws an AIError when Claude returns unparsable JSON', async () => {
    mockClaudeResponse('not json at all');
    await expect(matchmakerSearch({ apiKey: 'test-key', prompt: 'legs', gyms: [gym] }))
      .rejects.toThrow(AIError);
  });
});

describe('generateWorkoutPlan', () => {
  const gymWithEquipment = {
    id: 'g1', gymName: 'Iron Paradise',
    equipment: [
      { id: 'e1', name: 'Squat Rack', category: 'Free Weight', targetArea: 'Legs' },
      { id: 'e2', name: 'Lat Pulldown', category: 'Machine', targetArea: 'Back', outOfService: true },
      { id: 'e3', name: 'Treadmill', category: 'Cardio', targetArea: 'Cardio' },
    ],
  };

  it('throws an AIError when no API key is provided', async () => {
    await expect(generateWorkoutPlan({ apiKey: '', gym: gymWithEquipment, muscleGroups: ['Legs'] }))
      .rejects.toThrow(AIError);
  });

  it('only sends in-service equipment to the model', async () => {
    mockClaudeResponse(JSON.stringify({ title: 'Leg Day', summary: 's', estimatedDuration: '45 min', exercises: [], notes: '' }));

    await generateWorkoutPlan({ apiKey: 'test-key', gym: gymWithEquipment, muscleGroups: ['Legs'] });

    const [, options] = global.fetch.mock.calls[0];
    const sentBody = JSON.parse(options.body);
    const promptText = sentBody.messages[0].content;
    expect(promptText).toContain('Squat Rack');
    expect(promptText).not.toContain('Lat Pulldown');
  });

  it('parses a well-formed workout response', async () => {
    mockClaudeResponse(JSON.stringify({
      title: 'Leg Day',
      summary: 'Builds lower body strength',
      estimatedDuration: '45 minutes',
      exercises: [{ name: 'Back Squat', equipment: 'Squat Rack', targetMuscle: 'Quads', sets: 4, reps: '8-10', restSeconds: 90, instructions: 'Keep chest up.' }],
      notes: 'Warm up first.',
    }));

    const plan = await generateWorkoutPlan({ apiKey: 'test-key', gym: gymWithEquipment, muscleGroups: ['Legs'], experienceLevel: 'Beginner' });
    expect(plan.title).toBe('Leg Day');
    expect(plan.exercises).toHaveLength(1);
    expect(plan.exercises[0].equipment).toBe('Squat Rack');
  });

  it('throws an AIError when Claude returns unparsable JSON', async () => {
    mockClaudeResponse('not json at all');
    await expect(generateWorkoutPlan({ apiKey: 'test-key', gym: gymWithEquipment, muscleGroups: ['Legs'] }))
      .rejects.toThrow(AIError);
  });
});
