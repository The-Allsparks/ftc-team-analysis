import { describe, expect, it } from 'vitest';
import { emptyTeamScoutData } from '../data/ftcScout';
import type { FieldEvidence, TeamSeason } from '../data/schema';
import { fieldAgreement, googleFaviconUrl, sourceVoteTitle } from './sourceFieldAgreement';

function evidence(
  field: FieldEvidence['field'],
  value: string,
  sourceType: string,
  extras: Partial<FieldEvidence> = {},
): FieldEvidence {
  return {
    id: `${field}|${sourceType}|${value}`,
    field,
    value,
    kind: 'observed',
    sourceType,
    sourceUrl: extras.sourceUrl ?? 'https://example.test',
    retrievedAt: extras.retrievedAt ?? '2026-08-01T00:00:00.000Z',
    observedSeason: 2026,
    extractionMethod: 'test',
    confidence: 'medium',
    confirmationState: 'unconfirmed',
    status: extras.status ?? 'current',
    rawValue: null,
    ...extras,
  };
}

const season = {
  season: 2026,
  teamType: 'school',
} as TeamSeason;

describe('fieldAgreement', () => {
  it('uses majority value and splits agreeing vs dissenting sources', () => {
    const row: TeamSeason = {
      ...season,
      evidence: [
        evidence('teamType', 'school', 'ftc-events-team-page'),
        evidence('teamType', 'school', 'FTCScout'),
        evidence('teamType', 'non-school', 'Open Alliance'),
      ],
    };

    const agreement = fieldAgreement(row, 'teamType', 'school');
    expect(agreement?.majorityValue).toBe('school');
    expect(agreement?.majorityDisplay).toBe('School team');
    expect(agreement?.agreeing.map((vote) => vote.label).sort()).toEqual(['FTC Events', 'FTCScout']);
    expect(agreement?.dissenting.map((vote) => vote.label)).toEqual(['Open Alliance']);
    expect(agreement?.dissenting[0]?.displayValue).toBe('Non-school team');
  });

  it('keeps one vote per source using the newest retrievedAt', () => {
    const row: TeamSeason = {
      ...season,
      evidence: [
        evidence('teamType', 'non-school', 'ftc-events-team-page', {
          retrievedAt: '2025-01-01T00:00:00.000Z',
        }),
        evidence('teamType', 'school', 'ftc-events-team-page', {
          retrievedAt: '2026-08-01T00:00:00.000Z',
        }),
        evidence('teamType', 'school', 'FIRST API'),
      ],
    };

    const agreement = fieldAgreement(row, 'teamType');
    expect(agreement?.totalVotes).toBe(2);
    expect(agreement?.majorityValue).toBe('school');
    expect(agreement?.dissenting).toEqual([]);
  });

  it('breaks ties toward the displayed season value', () => {
    const row: TeamSeason = {
      ...season,
      teamType: 'non-school',
      evidence: [
        evidence('teamType', 'school', 'ftc-events-team-page'),
        evidence('teamType', 'non-school', 'FTCScout'),
      ],
    };

    expect(fieldAgreement(row, 'teamType', 'non-school')?.majorityValue).toBe('non-school');
  });

  it('builds hover text with last-seen date and a favicon URL', () => {
    const title = sourceVoteTitle({
      sourceId: 'ftc-events',
      label: 'FTC Events',
      faviconOrigin: 'https://ftc-events.firstinspires.org',
      homepage: 'https://ftc-events.firstinspires.org/',
      value: 'school',
      displayValue: 'School team',
      retrievedAt: '2026-04-15T12:00:00.000Z',
      sourceUrl: null,
      agreesWithMajority: true,
    });
    expect(title).toBe('FTC Events: School team · last seen 2026-04-15');
    expect(googleFaviconUrl('https://ftcscout.org')).toContain('ftcscout.org');
  });

  it('adds an NCES school vote when a catalog school is matched', () => {
    const row: TeamSeason = {
      ...season,
      organization: 'Tesla&Helen C Cannon Middle School',
      teamType: 'school',
      location: 'Las Vegas, NV, USA',
      city: 'Las Vegas',
      state: 'NV',
      country: 'USA',
      evidence: [evidence('teamType', 'school', 'ftc-events-team-page')],
    };

    const agreement = fieldAgreement(row, 'teamType', 'school');
    expect(agreement?.agreeing.map((vote) => vote.label).sort()).toEqual(['FTC Events', 'NCES']);
    expect(agreement?.dissenting).toEqual([]);
  });

  it('counts live FTCScout schoolName as a dissenting vote when it disagrees', () => {
    const row: TeamSeason = {
      ...season,
      teamType: 'school',
      evidence: [evidence('teamType', 'school', 'ftc-events-team-page')],
    };
    const scout = emptyTeamScoutData(2026, 12777);
    scout.profile = {
      number: 12777,
      name: 'Boulder City SuperBots',
      schoolName: '4-H',
      city: 'Boulder City',
      state: 'NV',
      country: 'USA',
      website: null,
      rookieYear: 2017,
      updatedAt: '2024-10-24T22:47:36.565Z',
    };

    const agreement = fieldAgreement(row, 'teamType', 'school', { teamNumber: 12777, scout });
    expect(agreement?.majorityValue).toBe('school');
    expect(agreement?.dissenting.map((vote) => vote.label)).toEqual(['FTCScout']);
    expect(agreement?.dissenting[0]?.displayValue).toBe('Non-school team');
    expect(agreement?.dissenting[0]?.retrievedAt).toBe('2024-10-24T22:47:36.565Z');
  });

  it('still uses live FTCScout when only a superseded Scout observation exists', () => {
    const row: TeamSeason = {
      ...season,
      teamType: 'school',
      evidence: [
        evidence('teamType', 'school', 'ftc-events-team-page'),
        evidence('teamType', 'unknown', 'FTCScout', {
          status: 'superseded',
          retrievedAt: '2025-01-01T00:00:00.000Z',
        }),
      ],
    };
    const scout = emptyTeamScoutData(2026, 12777);
    scout.profile = {
      number: 12777,
      name: 'Boulder City SuperBots',
      schoolName: '4-H',
      city: 'Boulder City',
      state: 'NV',
      country: 'USA',
      website: null,
      rookieYear: 2017,
      updatedAt: '2024-10-24T22:47:36.565Z',
    };

    const agreement = fieldAgreement(row, 'teamType', 'school', { teamNumber: 12777, scout });
    expect(agreement?.dissenting.map((vote) => vote.label)).toEqual(['FTCScout']);
    expect(agreement?.dissenting[0]?.value).toBe('non-school');
  });

  it('still uses live FTCScout when only a conflicting Scout observation exists', () => {
    const row: TeamSeason = {
      ...season,
      teamType: 'school',
      evidence: [
        evidence('teamType', 'school', 'ftc-events-team-page'),
        evidence('teamType', 'unknown', 'FTCScout', {
          status: 'conflicting',
          retrievedAt: '2025-01-01T00:00:00.000Z',
        }),
      ],
    };
    const scout = emptyTeamScoutData(2026, 12777);
    scout.profile = {
      number: 12777,
      name: 'Boulder City SuperBots',
      schoolName: '4-H',
      city: 'Boulder City',
      state: 'NV',
      country: 'USA',
      website: null,
      rookieYear: 2017,
      updatedAt: '2024-10-24T22:47:36.565Z',
    };

    const agreement = fieldAgreement(row, 'teamType', 'school', { teamNumber: 12777, scout });
    expect(agreement?.dissenting.map((vote) => vote.label)).toEqual(['FTCScout']);
    expect(agreement?.dissenting[0]?.value).toBe('non-school');
  });

  it('does not apply live FTCScout profile votes to a different season tab', () => {
    const row: TeamSeason = {
      ...season,
      season: 2025,
      teamType: 'school',
      evidence: [evidence('teamType', 'school', 'ftc-events-team-page')],
    };
    const scout = emptyTeamScoutData(2026, 12777);
    scout.profile = {
      number: 12777,
      name: 'Boulder City SuperBots',
      schoolName: '4-H',
      city: 'Boulder City',
      state: 'NV',
      country: 'USA',
      website: null,
      rookieYear: 2017,
      updatedAt: '2024-10-24T22:47:36.565Z',
    };

    const agreement = fieldAgreement(row, 'teamType', 'school', { teamNumber: 12777, scout });
    expect(agreement?.dissenting).toEqual([]);
    expect(agreement?.agreeing.map((vote) => vote.label)).toEqual(['FTC Events']);
  });

  it('counts an Open Alliance listing as a separate name vote on the current season', () => {
    const row: TeamSeason = {
      ...season,
      season: 2026,
      evidence: [evidence('name', 'Allsparks', 'ftc-events-team-page')],
    };

    const agreement = fieldAgreement(row, 'name', 'Allsparks', {
      teamNumber: 16158,
      openAllianceRetrievedAt: '2026-08-17T00:00:00.000Z',
      openAlliance: {
        TeamNumber: '16158',
        TeamName: 'Fixture Nevada Match',
        Location: 'Las Vegas, NV, USA',
        TeamWebsite: 'https://example-oa-16158.example/',
      },
    });

    expect(agreement?.dissenting.map((vote) => vote.label)).toEqual(['Open Alliance']);
    expect(agreement?.dissenting[0]?.displayValue).toBe('Fixture Nevada Match');
  });

  it('does not count Open Alliance listings on historical seasons', () => {
    const row: TeamSeason = {
      ...season,
      season: 2025,
      evidence: [evidence('name', 'Allsparks', 'ftc-events-team-page')],
    };

    const agreement = fieldAgreement(row, 'name', 'Allsparks', {
      teamNumber: 16158,
      openAllianceRetrievedAt: '2026-08-17T00:00:00.000Z',
      openAlliance: {
        TeamNumber: '16158',
        TeamName: 'Fixture Nevada Match',
      },
    });

    expect(agreement?.dissenting).toEqual([]);
    expect(agreement?.agreeing.map((vote) => vote.label)).toEqual(['FTC Events']);
  });

  it('counts a season-matched Portfolio Lab teamName as a name vote', () => {
    const row: TeamSeason = {
      ...season,
      season: 2025,
      evidence: [evidence('name', 'Allsparks', 'ftc-events-team-page')],
    };

    const agreement = fieldAgreement(row, 'name', 'Allsparks', {
      teamNumber: 16158,
      portfolioFetchedAt: '2026-08-17T00:00:00.000Z',
      portfolios: [
        {
          id: '16158-1',
          teamName: 'Portfolio Lab Sparks',
          teamNumber: 16158,
          country: 'USA',
          city: 'Reno',
          season: 'DECODE',
          level: 'inspire',
          stars: '5',
          score: '90',
          award: '',
          pdf: 'https://www.ftcportfoliolab.org/p.pdf',
          summary: 'Synthetic',
        },
      ],
    });

    expect(agreement?.dissenting.map((vote) => vote.label)).toEqual(['Portfolio Lab']);
    expect(agreement?.dissenting[0]?.displayValue).toBe('Portfolio Lab Sparks');
  });
});
