import { describe, expect, it } from 'vitest';
import { PortfolioLabEntry } from '../data/portfolioLab';
import { SeasonId, Team, TeamEvent, TeamSeason } from '../data/schema';
import {
  advancementLabel,
  advancementStatus,
  ALL_FILTER,
  ALL_SEASONS,
  countAwards,
  countPortfolioMatches,
  countUniqueEvents,
  eventKey,
  filterTeams,
  seasonFor,
  seasonLabel,
  seasonMatchesCriteria,
  seasonsForFilter,
  seasonValues,
  statLabel,
  teamSearchText,
  teamTypeLabel,
  uniqueSorted,
} from './teamDirectory';

function makeEvent(overrides: Partial<TeamEvent> & Pick<TeamEvent, 'code' | 'name'>): TeamEvent {
  return {
    code: overrides.code,
    name: overrides.name,
    dateRange: overrides.dateRange ?? null,
    eventOrder: overrides.eventOrder ?? null,
    location: overrides.location ?? null,
    league: overrides.league ?? null,
    rank: overrides.rank ?? null,
    totalPoints: overrides.totalPoints ?? null,
    matchCount: overrides.matchCount ?? 0,
    rankingScore: overrides.rankingScore ?? null,
    leagueSeasonRank: overrides.leagueSeasonRank ?? null,
    leagueSeasonRankTotal: overrides.leagueSeasonRankTotal ?? null,
    qualificationUrl: overrides.qualificationUrl ?? null,
    playoffUrl: overrides.playoffUrl ?? null,
    playoffRecord: overrides.playoffRecord ?? null,
    allianceSelection: overrides.allianceSelection ?? null,
    sourceUrl: overrides.sourceUrl ?? null,
  };
}

function makeSeason(overrides: Partial<TeamSeason> & { season: SeasonId }): TeamSeason {
  return {
    season: overrides.season,
    active: overrides.active ?? true,
    name: overrides.name ?? `Team ${overrides.season}`,
    location: overrides.location ?? 'Las Vegas, NV',
    city: overrides.city ?? 'Las Vegas',
    state: overrides.state ?? 'NV',
    country: overrides.country ?? 'USA',
    organization: overrides.organization ?? 'Example Org',
    affiliations: overrides.affiliations ?? [],
    website: overrides.website ?? null,
    summary: overrides.summary ?? null,
    record: overrides.record ?? null,
    qualificationRecord: overrides.qualificationRecord ?? null,
    playoffRecord: overrides.playoffRecord ?? null,
    rookieYear: overrides.rookieYear ?? 2020,
    league: overrides.league ?? 'Southern',
    region: overrides.region ?? 'Nevada',
    robot: overrides.robot ?? null,
    teamType: overrides.teamType ?? 'school',
    sourceUrl: overrides.sourceUrl ?? 'https://example.test',
    events: overrides.events ?? [],
    awards: overrides.awards ?? [],
    notes: overrides.notes ?? [],
    evidence: overrides.evidence ?? [],
  };
}

function makeTeam(number: number, seasons: TeamSeason[]): Team {
  const seasonMap = Object.fromEntries(seasons.map((season) => [season.season, season])) as Team['seasons'];
  const latest = seasons[0];

  return {
    number,
    latestName: latest?.name ?? `Team ${number}`,
    latestLocation: latest?.location ?? '',
    latestCity: latest?.city ?? null,
    latestState: latest?.state ?? null,
    latestCountry: latest?.country ?? null,
    latestRookieYear: latest?.rookieYear ?? null,
    latestOrganization: latest?.organization ?? null,
    latestWebsite: latest?.website ?? null,
    latestTeamType: latest?.teamType ?? 'unknown',
    latestLeague: latest?.league ?? null,
    latestRegion: latest?.region ?? null,
    seasons: seasonMap,
    links: [],
  };
}

function makePortfolio(overrides: Partial<PortfolioLabEntry> & Pick<PortfolioLabEntry, 'id' | 'teamNumber' | 'season'>): PortfolioLabEntry {
  return {
    id: overrides.id,
    teamName: overrides.teamName ?? `Team ${overrides.teamNumber}`,
    teamNumber: overrides.teamNumber,
    country: overrides.country ?? 'USA',
    city: overrides.city,
    season: overrides.season,
    level: overrides.level ?? 'team',
    stars: overrides.stars ?? '0',
    score: overrides.score ?? '0',
    award: overrides.award ?? '',
    cover: overrides.cover,
    pdf: overrides.pdf ?? 'https://example.test/p.pdf',
    summary: overrides.summary ?? '',
    source: overrides.source,
  };
}

describe('teamDirectory labels and keys', () => {
  it('formats season, team type, advancement, and stat labels', () => {
    expect(seasonLabel(2025)).toBe('2025-2026: DECODE');
    expect(seasonLabel(2026, { current: true })).toBe('2026-2027: BIOBUZZ (current)');
    expect(seasonLabel(2026, { current: true, available: false })).toBe(
      '2026-2027: BIOBUZZ (current, not yet published)',
    );
    expect(teamTypeLabel('school')).toBe('School team');
    expect(teamTypeLabel('non-school')).toBe('Non-school team');
    expect(teamTypeLabel('unknown')).toBe('Unknown team type');
    expect(advancementLabel('after-championship')).toBe('After Championship');
    expect(advancementLabel('to-championship')).toBe('To Championship');
    expect(advancementLabel('not-advancing')).toBe('Not Advancing');
    expect(statLabel(1, 'team')).toBe('1 team');
    expect(statLabel(2, 'team')).toBe('2 teams');
    expect(eventKey({ code: 'USNVCMP' })).toBe('USNVCMP');
    expect(eventKey({ name: 'Only Name' })).toBe('Only Name');
    expect(uniqueSorted(['b', null, 'a', 'b', ''])).toEqual(['a', 'b']);
  });
});

describe('advancementStatus', () => {
  it('detects premier / championship progression', () => {
    const after = makeSeason({
      season: 2025,
      events: [makeEvent({ code: 'FTCCMP1', name: 'FIRST Championship' })],
    });
    const toChamp = makeSeason({
      season: 2025,
      events: [makeEvent({ code: 'USNVCMP', name: 'Nevada Championship' })],
    });
    const none = makeSeason({
      season: 2025,
      events: [makeEvent({ code: 'USNVQ1', name: 'Qualifying Event' })],
    });

    expect(advancementStatus(after, 'USNV')).toBe('after-championship');
    expect(advancementStatus(toChamp, 'USNV')).toBe('to-championship');
    expect(advancementStatus(none, 'USNV')).toBe('not-advancing');
  });
});

describe('seasonMatchesCriteria and filterTeams', () => {
  const seasonA = makeSeason({
    season: 2025,
    city: 'Reno',
    league: 'Northern',
    rookieYear: 2019,
    teamType: 'school',
    awards: [{ name: 'Inspire', awardType: 'Inspire', eventName: 'Event', eventCode: null, awardUrl: null, eventUrl: null }],
  });
  const seasonB = makeSeason({
    season: 2025,
    city: 'Las Vegas',
    league: 'Southern',
    rookieYear: 2022,
    teamType: 'non-school',
    awards: [],
  });
  const teamA = makeTeam(100, [seasonA]);
  const teamB = makeTeam(200, [seasonB]);

  it('filters by league, city, awards, and search text', () => {
    expect(seasonMatchesCriteria(seasonA, { leagueFilter: 'Northern' })).toBe(true);
    expect(seasonMatchesCriteria(seasonA, { leagueFilter: 'Southern' })).toBe(false);
    expect(seasonMatchesCriteria(seasonA, { cityFilters: ['Reno'] })).toBe(true);
    expect(seasonMatchesCriteria(seasonB, { awardsOnly: true })).toBe(false);
    expect(seasonsForFilter(teamA, 2025)).toHaveLength(1);
    expect(teamSearchText(teamA)).toContain('northern');

    const filtered = filterTeams([teamA, teamB], {
      seasonFilter: 2025,
      query: 'northern',
      criteria: { regionCode: 'USNV' },
      portfoliosOnly: false,
      portfoliosByTeam: new Map(),
    });

    expect(filtered.map((team) => team.number)).toEqual([100]);
  });

  it('supports all-season scoping and portfolio-only matching', () => {
    expect(seasonsForFilter(teamA, ALL_SEASONS)).toHaveLength(1);
    expect(seasonsForFilter(teamA, 2024)).toHaveLength(0);
    expect(seasonFor(teamA, 2025)?.city).toBe('Reno');
    expect(seasonValues(teamA)).toHaveLength(1);

    const portfoliosByTeam = new Map<number, PortfolioLabEntry[]>([
      [100, [makePortfolio({ id: 'p1', teamNumber: 100, season: '2025 DECODE' })]],
    ]);

    const withPortfolios = filterTeams([teamA, teamB], {
      seasonFilter: 2025,
      query: '',
      criteria: { regionCode: 'USNV' },
      portfoliosOnly: true,
      portfoliosByTeam,
    });

    expect(withPortfolios.map((team) => team.number)).toEqual([100]);

    const none = filterTeams([teamA, teamB], {
      seasonFilter: 2024,
      query: '',
      criteria: { regionCode: 'USNV' },
      portfoliosOnly: true,
      portfoliosByTeam,
    });

    expect(none).toEqual([]);
  });

  it('treats after-championship as matching to-championship filter', () => {
    const after = makeSeason({
      season: 2025,
      events: [makeEvent({ code: 'FPE1', name: 'Premier Event' })],
    });

    expect(
      seasonMatchesCriteria(after, {
        advancementFilter: 'to-championship',
        regionCode: 'USNV',
      }),
    ).toBe(true);
    expect(seasonMatchesCriteria(after, { advancementFilter: ALL_FILTER, regionCode: 'USNV' })).toBe(true);
  });
});

describe('directory aggregate helpers', () => {
  it('counts events, awards, and portfolio matches', () => {
    const seasons = [
      makeSeason({
        season: 2025,
        events: [makeEvent({ code: 'A', name: 'One' }), makeEvent({ code: 'A', name: 'Dup' })],
        awards: [{ name: 'Think', awardType: 'Think', eventName: 'One', eventCode: 'A', awardUrl: null, eventUrl: null }],
      }),
    ];
    const teams = [makeTeam(1, seasons)];
    const portfoliosByTeam = new Map<number, PortfolioLabEntry[]>([
      [
        1,
        [
          makePortfolio({ id: 'p1', teamNumber: 1, season: '2025 DECODE' }),
          makePortfolio({ id: 'p2', teamNumber: 1, season: '2024 INTO THE DEEP' }),
        ],
      ],
    ]);

    expect(countUniqueEvents(seasons)).toBe(1);
    expect(countAwards(seasons)).toBe(1);
    expect(countPortfolioMatches(teams, ALL_SEASONS, portfoliosByTeam)).toBe(2);
    expect(countPortfolioMatches(teams, 2025, portfoliosByTeam)).toBe(1);
  });
});
