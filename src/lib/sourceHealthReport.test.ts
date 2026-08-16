import { describe, expect, it } from 'vitest';
import { GeneratedData, SeasonId, Team, TeamSeason } from '../data/schema';
import {
  buildSeasonCountDeltas,
  buildSourceHealthReport,
  formatSeedAge,
  isDataHealthHash,
  readLastSeenTeamCount,
  SEASON_COUNT_DROP_HIGHLIGHT_RATIO,
  STALE_SEED_MAX_AGE_MS,
  writeLastSeenTeamCount,
} from './sourceHealthReport';

function makeSeason(
  season: SeasonId,
  overrides: Partial<TeamSeason> & Pick<TeamSeason, 'name'>,
): TeamSeason {
  return {
    season,
    active: true,
    location: 'Las Vegas, NV, USA',
    city: 'Las Vegas',
    state: 'NV',
    country: 'USA',
    region: 'Nevada',
    league: null,
    rookieYear: 2020,
    organization: 'Helen C Cannon Middle School',
    teamType: 'school',
    website: null,
    robot: null,
    sourceUrl: `https://ftc-events.firstinspires.org/${season}/team/1`,
    summary: null,
    record: null,
    qualificationRecord: null,
    playoffRecord: null,
    events: [],
    awards: [],
    notes: [],
    ...overrides,
  };
}

function makeTeam(number: number, seasons: TeamSeason[]): Team {
  const seasonMap = Object.fromEntries(seasons.map((season) => [season.season, season])) as Team['seasons'];
  const latest = seasons[seasons.length - 1];

  return {
    number,
    latestName: latest?.name ?? `Team ${number}`,
    latestLocation: latest?.location ?? 'Las Vegas, NV, USA',
    latestCity: latest?.city ?? 'Las Vegas',
    latestState: latest?.state ?? 'NV',
    latestCountry: latest?.country ?? 'USA',
    latestRookieYear: latest?.rookieYear ?? 2020,
    latestOrganization: latest?.organization ?? null,
    latestWebsite: latest?.website ?? null,
    latestTeamType: latest?.teamType ?? 'unknown',
    latestLeague: null,
    latestRegion: 'Nevada',
    links: [],
    seasons: seasonMap,
  };
}

function snapshot(overrides: Partial<GeneratedData> & Pick<GeneratedData, 'teams' | 'generatedAt'>): GeneratedData {
  return {
    targetSeasons: [2025, 2024],
    regionCode: 'USNV',
    regionLabel: 'Nevada',
    regionEvents: [],
    sources: [],
    limitations: [],
    ...overrides,
  };
}

describe('sourceHealthReport', () => {
  it('flags seed stale after 8 days and lists source check failures', () => {
    const generatedAt = '2026-08-01T00:00:00.000Z';
    const data = snapshot({
      generatedAt,
      teams: [makeTeam(1, [makeSeason(2025, { name: 'Alpha' })])],
      sourceChecks: [
        {
          label: 'FTC Events region USNV 2025',
          url: 'https://ftc-events.firstinspires.org/2025/region/USNV',
          checkedAt: '2026-08-01T00:00:00.000Z',
          ok: false,
          detail: 'GET failed with 503',
        },
        {
          label: 'FTC Events public team pages',
          url: 'https://ftc-events.firstinspires.org/2025/team/1',
          checkedAt: '2026-08-01T00:00:01.000Z',
          ok: true,
          detail: 'Fetched 1 team page',
        },
      ],
    });

    const fresh = buildSourceHealthReport(data, { now: '2026-08-05T00:00:00.000Z' });
    expect(fresh.seedStale).toBe(false);
    expect(fresh.seedAgeMs).toBeLessThanOrEqual(STALE_SEED_MAX_AGE_MS);

    const stale = buildSourceHealthReport(data, { now: '2026-08-10T00:00:01.000Z' });
    expect(stale.seedStale).toBe(true);
    expect(stale.sourceCheckFailures).toHaveLength(1);
    expect(stale.sourceCheckFailures[0]?.detail).toContain('503');
  });

  it('aggregates coverage gaps and affiliation confidence', () => {
    const data = snapshot({
      generatedAt: '2026-08-16T00:00:00.000Z',
      teams: [
        makeTeam(10, [
          makeSeason(2025, {
            name: 'With Site',
            website: 'https://example.org',
            organization: 'Tesla&Helen C Cannon Middle School',
          }),
        ]),
        makeTeam(11, [
          makeSeason(2025, {
            name: 'Gaps',
            website: null,
            organization: null,
            location: '',
          }),
        ]),
      ],
    });

    const report = buildSourceHealthReport(data, { now: '2026-08-16T12:00:00.000Z' });
    expect(report.teamCount).toBe(2);
    expect(report.missingWebsiteTotal).toBe(1);
    expect(report.missingOrganizationTotal).toBe(1);
    expect(report.missingLocationTotal).toBe(1);
    expect(report.coverageBySeason[0]?.season).toBe(2025);
    expect(report.affiliationConfidence.high + report.affiliationConfidence.medium + report.affiliationConfidence.low).toBeGreaterThan(
      0,
    );
  });

  it('highlights sudden season-over-season team count drops', () => {
    const teams: Team[] = [];
    for (let number = 1; number <= 20; number += 1) {
      teams.push(makeTeam(number, [makeSeason(2024, { name: `T${number}` })]));
    }
    for (let number = 1; number <= 10; number += 1) {
      const existing = teams[number - 1]!;
      existing.seasons[2025] = makeSeason(2025, { name: `T${number}` });
    }

    const deltas = buildSeasonCountDeltas(teams);
    expect(deltas).toEqual([
      expect.objectContaining({
        fromSeason: 2024,
        toSeason: 2025,
        fromCount: 20,
        toCount: 10,
        delta: -10,
        highlighted: true,
      }),
    ]);
    expect(deltas[0]!.dropRatio).toBeCloseTo(SEASON_COUNT_DROP_HIGHLIGHT_RATIO * 2.5, 5);

    const report = buildSourceHealthReport(
      snapshot({ generatedAt: '2026-08-16T00:00:00.000Z', teams }),
      { now: '2026-08-16T00:00:00.000Z' },
    );
    expect(report.seasonCountDeltas.some((row) => row.highlighted)).toBe(true);
  });

  it('feeds session SourceResult failures into the live panel without requiring probes', () => {
    const data = snapshot({
      generatedAt: '2026-08-16T00:00:00.000Z',
      teams: [makeTeam(1, [makeSeason(2025, { name: 'Solo' })])],
    });

    const report = buildSourceHealthReport(data, {
      now: '2026-08-16T00:00:00.000Z',
      liveSources: [
        {
          id: 'ftc-events',
          label: 'FTC Events (session)',
          sessionStatus: 'error',
          sourceState: 'network_failure',
          message: 'Could not reach FTC Events.',
          diagnostics: 'TypeError: Failed to fetch',
        },
        {
          id: 'ftcscout',
          label: 'FTCScout (session)',
          sessionStatus: 'idle',
          sourceState: null,
          message: null,
          diagnostics: null,
        },
      ],
    });

    expect(report.liveFailureCount).toBe(1);
    expect(report.liveSources[0]?.sourceState).toBe('network_failure');
  });

  it('compares optional localStorage last-seen team count', () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
    };

    writeLastSeenTeamCount(40, storage, '2026-08-01T00:00:00.000Z');
    expect(readLastSeenTeamCount(storage)).toEqual({
      count: 40,
      seenAt: '2026-08-01T00:00:00.000Z',
    });

    const report = buildSourceHealthReport(
      snapshot({
        generatedAt: '2026-08-16T00:00:00.000Z',
        teams: Array.from({ length: 20 }, (_, index) =>
          makeTeam(index + 1, [makeSeason(2025, { name: `T${index + 1}` })]),
        ),
      }),
      {
        now: '2026-08-16T00:00:00.000Z',
        lastSeenTeamCount: 40,
        lastSeenAt: '2026-08-01T00:00:00.000Z',
      },
    );

    expect(report.lastSeenTeamCountDelta).toEqual(
      expect.objectContaining({
        previousCount: 40,
        currentCount: 20,
        delta: -20,
        highlighted: true,
      }),
    );
  });

  it('counts unverified inferred relationships and conflicting evidence', () => {
    const prior = makeTeam(1001, [
      makeSeason(2022, {
        name: 'Cannon Bots',
        organization: 'Helen C Cannon Middle School',
        teamType: 'school',
      }),
    ]);
    const later = makeTeam(1002, [
      makeSeason(2024, {
        name: 'Cannon Robotics',
        organization: 'Helen C Cannon Middle School',
        teamType: 'school',
      }),
    ]);
    later.seasons[2024]!.evidence = [
      {
        id: 'name|a|alpha|null',
        field: 'name',
        value: 'Alpha',
        kind: 'observed',
        sourceType: 'ftc-events-team-page',
        sourceUrl: null,
        retrievedAt: null,
        observedSeason: 2024,
        extractionMethod: 'test',
        confidence: 'high',
        confirmationState: 'unconfirmed',
        status: 'conflicting',
        rawValue: null,
        supersedesId: null,
      },
    ];

    const report = buildSourceHealthReport(
      snapshot({ generatedAt: '2026-08-16T00:00:00.000Z', teams: [prior, later] }),
      { now: '2026-08-16T00:00:00.000Z' },
    );

    expect(report.unverifiedRelationshipCount).toBeGreaterThan(0);
    expect(report.evidence.conflictingObservations).toBe(1);
    expect(report.evidence.unconfirmedObservations).toBeGreaterThan(0);
  });

  it('recognizes the data-health hash and formats seed age', () => {
    expect(isDataHealthHash('#health')).toBe(true);
    expect(isDataHealthHash('#/health')).toBe(true);
    expect(isDataHealthHash('#teams')).toBe(false);
    expect(formatSeedAge(3 * 24 * 60 * 60 * 1000)).toBe('3d');
  });
});
