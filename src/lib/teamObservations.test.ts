import { describe, expect, it } from 'vitest';
import type { GeneratedData, Team, TeamSeason } from '../data/schema';
import { createEvidence, evidenceForField } from './fieldEvidence';
import {
  attachObservationsToData,
  emptyTeamObservations,
  mergeIncomingSeasonObservations,
  recordPresenceDropped,
  stripSeasonEvidence,
  syncObservationsFromPull,
  synthesizeBaselineObservations,
} from './teamObservations';

function season(overrides: Partial<TeamSeason> & Pick<TeamSeason, 'season' | 'name'>): TeamSeason {
  return {
    active: true,
    location: 'Reno, NV, USA',
    city: 'Reno',
    state: 'NV',
    country: 'USA',
    region: 'Nevada',
    league: 'Northern Nevada',
    rookieYear: 2020,
    organization: 'School&Sponsor',
    teamType: 'school',
    website: 'https://example.test',
    robot: 'Bot',
    sourceUrl: `https://ftc-events.firstinspires.org/${overrides.season}/team/1`,
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

function team(number: number, seasons: Team['seasons']): Team {
  return {
    number,
    latestName: 'Alpha',
    latestLocation: 'Reno, NV, USA',
    latestCity: 'Reno',
    latestState: 'NV',
    latestCountry: 'USA',
    latestRookieYear: 2020,
    latestOrganization: 'School&Sponsor',
    latestWebsite: 'https://example.test',
    latestTeamType: 'school',
    latestLeague: 'Northern Nevada',
    latestRegion: 'Nevada',
    links: [],
    seasons,
  };
}

function snapshot(teams: Team[]): GeneratedData {
  return {
    generatedAt: '2026-08-16T12:00:00.000Z',
    targetSeasons: [2025],
    regionCode: 'USNV',
    teams,
    regionEvents: [],
    sources: [],
    limitations: [],
  };
}

describe('teamObservations', () => {
  it('synthesizes baseline observations once and retains them across a name change', () => {
    const previous = snapshot([team(1, { 2025: season({ season: 2025, name: 'Alpha' }) })]);
    const empty = emptyTeamObservations('USNV', previous.generatedAt);
    const withBaseline = synthesizeBaselineObservations(previous, empty);

    expect(withBaseline.observations.some((row) => row.field === 'name' && row.value === 'Alpha')).toBe(
      true,
    );
    expect(withBaseline.observations.every((row) => row.retrievedAt === null)).toBe(true);

    const candidate = snapshot([
      team(1, {
        2025: {
          ...season({ season: 2025, name: 'Alpha Renamed' }),
          evidence: [
            createEvidence({
              field: 'name',
              value: 'Alpha Renamed',
              sourceType: 'ftc-events-team-page',
              sourceUrl: 'https://example.test/1',
              retrievedAt: '2026-08-16T13:00:00.000Z',
              observedSeason: 2025,
              extractionMethod: 'html-title',
            }),
          ],
        },
      }),
    ]);

    const synced = syncObservationsFromPull({
      previous,
      previousStore: withBaseline,
      candidate,
      refreshedSeason: 2025,
      retrievedAt: candidate.generatedAt,
    });

    const names = evidenceForField(
      synced.observations.filter((row) => row.teamNumber === 1 && row.field === 'name'),
      'name',
    );
    expect(names.some((row) => row.status === 'current' && row.value === 'Alpha Renamed')).toBe(true);
    expect(names.some((row) => row.status === 'superseded' && row.value === 'Alpha')).toBe(true);
  });

  it('records presence drop as active=false without deleting prior name observations', () => {
    const previous = snapshot([team(9, { 2025: season({ season: 2025, name: 'Gone' }) })]);
    const store = synthesizeBaselineObservations(previous, emptyTeamObservations('USNV'));
    const afterDrop = recordPresenceDropped(
      store,
      9,
      previous.teams[0]!.seasons[2025]!,
      '2026-08-16T14:00:00.000Z',
    );

    const active = afterDrop.observations.filter((row) => row.teamNumber === 9 && row.field === 'active');
    expect(active.some((row) => row.status === 'current' && row.value === 'false')).toBe(true);
    expect(
      afterDrop.observations.some(
        (row) => row.teamNumber === 9 && row.field === 'name' && row.value === 'Gone',
      ),
    ).toBe(true);
  });

  it('strips seed evidence and reattaches from the side store for UI', () => {
    const withEvidence = snapshot([
      team(1, {
        2025: {
          ...season({ season: 2025, name: 'Alpha' }),
          evidence: [
            createEvidence({
              field: 'name',
              value: 'Alpha',
              sourceType: 'ftc-events-team-page',
              sourceUrl: 'https://example.test/1',
              retrievedAt: '2026-08-16T12:00:00.000Z',
              observedSeason: 2025,
              extractionMethod: 'html-title',
            }),
          ],
        },
      }),
    ]);

    let store = emptyTeamObservations('USNV');
    store = mergeIncomingSeasonObservations(
      store,
      1,
      2025,
      withEvidence.teams[0]!.seasons[2025]!.evidence,
    );
    const stripped = stripSeasonEvidence(withEvidence);
    expect(stripped.teams[0]!.seasons[2025]!.evidence).toBeUndefined();

    const attached = attachObservationsToData(stripped, store);
    expect(attached.teams[0]!.seasons[2025]!.evidence?.[0]?.value).toBe('Alpha');
  });
});
