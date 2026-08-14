import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  GENERATED_DATA_SCHEMA_VERSION,
  GENERATED_SEED_EMPTY_TEAMS,
  GENERATED_SEED_NOT_OBJECT,
  generatedSeedAllQuarantinedMessage,
  parseGeneratedSeed,
} from './generatedSeedSchema';

const SEED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'nv-ftc-teams.generated.json');

const validSeason = {
  season: 2025 as const,
  active: true,
  name: 'Test Robotics',
  location: 'Reno, NV, USA',
  city: 'Reno',
  state: 'NV',
  country: 'USA',
  region: 'Nevada',
  league: null,
  rookieYear: 2020,
  organization: null,
  teamType: 'school' as const,
  website: null,
  robot: null,
  sourceUrl: 'https://ftc-events.firstinspires.org/2025/team/1',
  summary: null,
  record: null,
  qualificationRecord: null,
  playoffRecord: null,
  events: [],
  awards: [],
  notes: [],
};

const validTeam = {
  number: 1,
  latestName: 'Test Robotics',
  latestLocation: 'Reno, NV, USA',
  latestCity: 'Reno',
  latestState: 'NV',
  latestCountry: 'USA',
  latestRookieYear: 2020,
  latestOrganization: null,
  latestWebsite: null,
  latestTeamType: 'school' as const,
  latestLeague: null,
  latestRegion: 'Nevada',
  links: [],
  seasons: { '2025': validSeason },
};

const validSources = [
  {
    label: 'FTC Events Public Team Pages',
    url: 'https://ftc-events.firstinspires.org/2025/team/16158',
    note: 'Public team pages provide event participation and awards.',
  },
];

function validSeed() {
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    targetSeasons: [2025],
    regionCode: 'USNV',
    teams: [
      structuredClone(validTeam),
      {
        ...structuredClone(validTeam),
        number: 2,
        latestName: 'Second Team',
        seasons: {
          '2025': { ...structuredClone(validSeason), name: 'Second Team', sourceUrl: 'https://ftc-events.firstinspires.org/2025/team/2' },
        },
      },
    ],
    regionEvents: [],
    sources: structuredClone(validSources),
    limitations: ['Public-only snapshot.'],
  };
}

describe('parseGeneratedSeed', () => {
  it('accepts a valid in-memory fixture and preserves document-level sources', () => {
    const result = parseGeneratedSeed(validSeed());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.quarantined).toEqual([]);
    expect(result.data.teams).toHaveLength(2);
    expect(result.data.sources).toEqual(validSources);
    expect(result.data.schemaVersion).toBeUndefined();
  });

  it('accepts the checked-in Nevada seed without rewriting it', () => {
    const raw: unknown = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
    const result = parseGeneratedSeed(raw);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.quarantined).toEqual([]);
    expect(result.data.teams.length).toBeGreaterThan(0);
    expect(result.data.sources.length).toBeGreaterThan(0);
  });

  it('quarantines one invalid team and keeps the rest', () => {
    const fixture = validSeed();
    (fixture.teams[0] as { latestName: unknown }).latestName = 123;

    const result = parseGeneratedSeed(fixture);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.teams).toHaveLength(1);
    expect(result.data.teams[0]?.number).toBe(2);
    expect(result.quarantined.length).toBeGreaterThan(0);
    expect(result.quarantined.some((issue) => issue.teamNumber === 1)).toBe(true);
    expect(result.quarantined.some((issue) => issue.path.includes('teams[0]'))).toBe(true);
  });

  it('fails closed when the envelope is not an object or teams is missing', () => {
    expect(parseGeneratedSeed(null)).toEqual({
      ok: false,
      kind: 'invalid-envelope',
      issues: [{ path: '(root)', message: GENERATED_SEED_NOT_OBJECT }],
    });
    expect(parseGeneratedSeed([])).toEqual({
      ok: false,
      kind: 'invalid-envelope',
      issues: [{ path: '(root)', message: GENERATED_SEED_NOT_OBJECT }],
    });
    expect(parseGeneratedSeed({ generatedAt: '2026-01-01T00:00:00.000Z' })).toEqual({
      ok: false,
      kind: 'invalid-envelope',
      issues: [{ path: 'teams', message: GENERATED_SEED_NOT_OBJECT }],
    });
  });

  it('fails closed on an empty teams array', () => {
    const fixture = validSeed();
    fixture.teams = [];

    expect(parseGeneratedSeed(fixture)).toEqual({
      ok: false,
      kind: 'invalid-envelope',
      issues: [{ path: 'teams', message: GENERATED_SEED_EMPTY_TEAMS }],
    });
  });

  it('fails closed when every team is quarantined', () => {
    const fixture = validSeed();
    (fixture.teams[0] as { number: unknown }).number = '1';
    (fixture.teams[1] as { number: unknown }).number = '2';

    const result = parseGeneratedSeed(fixture);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.kind).toBe('invalid-envelope');
    expect(result.issues[0]).toEqual({
      path: 'teams',
      message: generatedSeedAllQuarantinedMessage(2),
    });
    expect(result.issues.some((issue) => issue.path.includes('teams[0]'))).toBe(true);
  });

  it('fails closed on an unsupported schemaVersion', () => {
    const fixture = { ...validSeed(), schemaVersion: 999 };
    const result = parseGeneratedSeed(fixture);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.kind).toBe('invalid-envelope');
    expect(result.issues.some((issue) => issue.path.includes('schemaVersion'))).toBe(true);
  });

  it('accepts schemaVersion 1 when present', () => {
    const result = parseGeneratedSeed({ ...validSeed(), schemaVersion: GENERATED_DATA_SCHEMA_VERSION });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.schemaVersion).toBe(GENERATED_DATA_SCHEMA_VERSION);
  });
});
