import { describe, expect, it } from 'vitest';
import { GeneratedData, Team } from './schema';
import { mergeSeasonRefresh } from './seasonMerge';

function team(number: number, seasons: Team['seasons'], links: Team['links'] = []): Team {
  return {
    number,
    latestName: `Team ${number}`,
    latestLocation: 'Reno, NV, USA',
    latestCity: 'Reno',
    latestState: 'NV',
    latestCountry: 'USA',
    latestRookieYear: 2020,
    latestOrganization: null,
    latestWebsite: null,
    latestTeamType: 'school',
    latestLeague: null,
    latestRegion: 'Nevada',
    links,
    seasons,
  };
}

function season(year: 2025 | 2026, name: string) {
  return {
    season: year,
    active: true,
    name,
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
    sourceUrl: `https://ftc-events.firstinspires.org/${year}/team/1`,
    summary: null,
    record: null,
    qualificationRecord: null,
    playoffRecord: null,
    events: [],
    awards: [],
    notes: [],
  };
}

function previous(): GeneratedData {
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    targetSeasons: [2025, 2024],
    regionCode: 'USNV',
    teams: [
      team(1, { 2025: season(2025, 'Alpha') }),
      team(2, { 2025: season(2025, 'Beta'), 2026: season(2026, 'Beta 2026') }),
    ],
    regionEvents: [
      {
        season: 2025,
        code: 'USNVTEST',
        name: 'Old Event',
        league: null,
        date: null,
        location: null,
        sourceUrl: 'https://example.test/2025',
      },
      {
        season: 2026,
        code: 'USNVOLD',
        name: 'Stale 2026 Event',
        league: null,
        date: null,
        location: null,
        sourceUrl: 'https://example.test/2026-old',
      },
    ],
    sources: [],
    limitations: [],
  };
}

describe('mergeSeasonRefresh', () => {
  it('merges current-season rows while preserving historical seasons', () => {
    const refreshed = [
      team(2, { 2026: season(2026, 'Beta refreshed') }),
      team(3, { 2026: season(2026, 'Gamma') }),
    ];
    const merged = mergeSeasonRefresh(previous(), 2026, refreshed, [
      {
        season: 2026,
        code: 'USNVNEW',
        name: 'New 2026 Event',
        league: null,
        date: null,
        location: null,
        sourceUrl: 'https://example.test/2026-new',
      },
    ]);

    expect(merged.teams.map((item) => item.number).sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(merged.teams.find((item) => item.number === 1)?.seasons[2025]?.name).toBe('Alpha');
    expect(merged.teams.find((item) => item.number === 1)?.seasons[2026]).toBeUndefined();
    expect(merged.teams.find((item) => item.number === 2)?.seasons[2025]?.name).toBe('Beta');
    expect(merged.teams.find((item) => item.number === 2)?.seasons[2026]?.name).toBe('Beta refreshed');
    expect(merged.teams.find((item) => item.number === 3)?.seasons[2026]?.name).toBe('Gamma');
    expect(merged.regionEvents.map((event) => event.code).sort()).toEqual(['USNVNEW', 'USNVTEST']);
    expect(merged.targetSeasons).toContain(2026);
    expect(merged.targetSeasons).toContain(2025);
  });

  it('preserves prior evidence when a season row is refreshed with a changed value', () => {
    const prior = previous();
    prior.teams = [
      team(1, {
        2026: {
          ...season(2026, 'Old Name'),
          evidence: [
            {
              id: 'name|ftc-events-team-page|old name|2026-01-01T00:00:00.000Z',
              field: 'name',
              value: 'Old Name',
              kind: 'observed',
              sourceType: 'ftc-events-team-page',
              sourceUrl: 'https://example.test/2026/team/1',
              retrievedAt: '2026-01-01T00:00:00.000Z',
              observedSeason: 2026,
              extractionMethod: 'html-title',
              confidence: 'high',
              confirmationState: 'unconfirmed',
              status: 'current',
              rawValue: null,
              supersedesId: null,
            },
          ],
        },
      }),
    ];

    const merged = mergeSeasonRefresh(
      prior,
      2026,
      [
        team(1, {
          2026: {
            ...season(2026, 'New Name'),
            evidence: [
              {
                id: 'name|ftc-events-team-page|new name|2026-02-01T00:00:00.000Z',
                field: 'name',
                value: 'New Name',
                kind: 'observed',
                sourceType: 'ftc-events-team-page',
                sourceUrl: 'https://example.test/2026/team/1',
                retrievedAt: '2026-02-01T00:00:00.000Z',
                observedSeason: 2026,
                extractionMethod: 'html-title',
                confidence: 'high',
                confirmationState: 'unconfirmed',
                status: 'current',
                rawValue: null,
                supersedesId: null,
              },
            ],
          },
        }),
      ],
      [],
    );

    const evidence = merged.teams[0]?.seasons[2026]?.evidence ?? [];
    expect(evidence.some((row) => row.status === 'current' && row.value === 'New Name')).toBe(true);
    expect(evidence.some((row) => row.status === 'superseded' && row.value === 'Old Name')).toBe(true);
  });

  it('removes teams that only existed in the refreshed season and dropped out', () => {
    const prior = previous();
    prior.teams = [team(9, { 2026: season(2026, 'Only 2026') })];
    const merged = mergeSeasonRefresh(prior, 2026, [], []);
    expect(merged.teams).toEqual([]);
  });
});
