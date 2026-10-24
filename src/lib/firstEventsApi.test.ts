import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { Team, TeamSeason } from '../data/schema';
import {
  applyFirstApiCompetitiveEnrichment,
  buildBasicAuthHeader,
  buildFirstApiUrl,
  fetchAllFirstApiTeams,
  fetchFirstApiJson,
  fetchFirstApiTeamFromProxy,
  isAllowedFirstApiPath,
  mapFirstApiAwardToTeamAward,
  mergeFirstApiAwardsIntoSeason,
  mergeFirstApiRankingIntoSeason,
  missingFirstApiCredentialsFailure,
  normalizeFirstApiPath,
  readFirstApiCredentials,
  type FirstApiAward,
  type FirstApiRanking,
} from './firstEventsApi';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const sample = JSON.parse(
  readFileSync(join(fixtureDir, 'first-api-sample.json'), 'utf8'),
) as {
  teamsPage: { teams: unknown[]; pageTotal: number };
  awardsFor16158: { awards: FirstApiAward[] };
  rankingsUSNVFIX: { rankings: FirstApiRanking[] };
};

function baseSeason(overrides?: Partial<TeamSeason>): TeamSeason {
  return {
    season: 2025,
    active: true,
    name: 'Allsparks',
    location: 'Reno, NV, USA',
    city: 'Reno',
    state: 'NV',
    country: 'USA',
    region: 'Nevada',
    league: null,
    rookieYear: 2019,
    organization: null,
    teamType: 'school',
    website: null,
    robot: null,
    sourceUrl: 'https://ftc-events.firstinspires.org/2025/team/16158',
    summary: null,
    record: { wins: 3, losses: 2, ties: 0, text: '3-2-0' },
    qualificationRecord: { wins: 3, losses: 2, ties: 0, text: '3-2-0' },
    playoffRecord: null,
    events: [
      {
        code: 'USNVFIX',
        name: 'HTML scrape event name',
        dateRange: null,
        eventOrder: 1,
        location: 'Reno',
        league: null,
        rank: '9',
        totalPoints: null,
        matchCount: 4,
        rankingScore: 1.0,
        leagueSeasonRank: null,
        leagueSeasonRankTotal: null,
        qualificationUrl: null,
        playoffUrl: null,
        playoffRecord: null,
        allianceSelection: null,
        sourceUrl: null,
      },
    ],
    awards: [
      {
        name: 'HTML-only Award',
        awardType: 'HTML-only Award',
        eventName: 'HTML scrape event name',
        eventCode: 'USNVFIX',
        awardUrl: null,
        eventUrl: null,
      },
    ],
    notes: [],
    ...overrides,
  };
}

function baseTeam(overrides?: Partial<Team>): Team {
  return {
    number: 16158,
    latestName: 'Allsparks',
    latestLocation: 'Reno, NV, USA',
    latestCity: 'Reno',
    latestState: 'NV',
    latestCountry: 'USA',
    latestRookieYear: 2019,
    latestOrganization: null,
    latestWebsite: null,
    latestTeamType: 'school',
    latestLeague: null,
    latestRegion: 'Nevada',
    links: [],
    seasons: { 2025: baseSeason() },
    ...overrides,
  };
}

describe('readFirstApiCredentials', () => {
  it('requires both username and token; never invents values', () => {
    expect(readFirstApiCredentials({})).toBeNull();
    expect(readFirstApiCredentials({ FIRST_API_USERNAME: 'user' })).toBeNull();
    expect(readFirstApiCredentials({ FIRST_API_TOKEN: 'token' })).toBeNull();
    expect(
      readFirstApiCredentials({ FIRST_API_USERNAME: ' user ', FIRST_API_TOKEN: ' token ' }),
    ).toEqual({ username: 'user', token: 'token' });
  });
});

describe('path allowlist', () => {
  it('allows competitive GET paths and rejects others', () => {
    expect(isAllowedFirstApiPath('/2025/teams')).toBe(true);
    expect(isAllowedFirstApiPath('/v2.0/2025/awards/16158')).toBe(true);
    expect(isAllowedFirstApiPath('/2025/rankings/USNVFIX')).toBe(true);
    expect(isAllowedFirstApiPath('/2025/matches/USNVFIX')).toBe(true);
    expect(isAllowedFirstApiPath('/2025/leagues/rankings/USNV/SO')).toBe(true);
    expect(isAllowedFirstApiPath('/2025/scores/USNVFIX/qual')).toBe(false);
    expect(isAllowedFirstApiPath('/admin')).toBe(false);
    expect(() => normalizeFirstApiPath('https://evil.example/v2.0/2025/teams')).toThrow(
      /relative/,
    );
    expect(() => buildFirstApiUrl('/2025/../secret')).toThrow();
  });
});

describe('buildBasicAuthHeader', () => {
  it('encodes username:token as Basic auth (synthetic values only)', () => {
    const header = buildBasicAuthHeader({
      username: 'sampleuser',
      token: '7eaa6338-a097-4221-ac04-b6120fcc4d49',
    });
    expect(header).toBe(
      `Basic ${btoa('sampleuser:7eaa6338-a097-4221-ac04-b6120fcc4d49')}`,
    );
  });
});

describe('fetchFirstApiJson', () => {
  it('returns credentials_absent without calling fetch', async () => {
    const fetchImpl = vi.fn();
    const result = await fetchFirstApiJson('/2025/teams', { fetchImpl, credentials: null });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.state).toBe('auth_failure');
      expect(result.diagnostics).toContain('credentials_absent');
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(missingFirstApiCredentialsFailure().diagnostics).toContain('FIRST_API_USERNAME');
  });

  it('maps HTTP 401 to auth_failure', async () => {
    const fetchImpl = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    const result = await fetchFirstApiJson('/2025/teams', {
      credentials: { username: 'u', token: 't' },
      fetchImpl,
      delayMs: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.state).toBe('auth_failure');
    }
  });

  it('maps HTTP 429 to rate_limited', async () => {
    const fetchImpl = vi.fn(async () => new Response('slow down', { status: 429 }));
    const result = await fetchFirstApiJson('/2025/teams', {
      credentials: { username: 'u', token: 't' },
      fetchImpl,
      delayMs: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.state).toBe('rate_limited');
    }
  });

  it('returns fixture JSON on success and sends Basic auth', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain('https://ftc-api.firstinspires.org/v2.0/2025/teams');
      expect(init?.headers).toMatchObject({
        Authorization: buildBasicAuthHeader({ username: 'u', token: 't' }),
      });
      return new Response(JSON.stringify(sample.teamsPage), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const result = await fetchFirstApiJson<typeof sample.teamsPage>('/2025/teams', {
      credentials: { username: 'u', token: 't' },
      fetchImpl: fetchImpl as typeof fetch,
      delayMs: 0,
      query: { state: 'Nevada' },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.teams).toHaveLength(2);
      expect(result.data.teams?.[0]).toMatchObject({ teamNumber: 16158 });
    }
  });
});

describe('fetchAllFirstApiTeams', () => {
  it('paginates until pageTotal', async () => {
    const pages = [
      {
        teams: [{ teamNumber: 1 }],
        pageCurrent: 1,
        pageTotal: 2,
        teamCountPage: 1,
        teamCountTotal: 2,
      },
      {
        teams: [{ teamNumber: 2 }],
        pageCurrent: 2,
        pageTotal: 2,
        teamCountPage: 1,
        teamCountTotal: 2,
      },
    ];
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      const body = pages[call] ?? pages[pages.length - 1];
      call += 1;
      return new Response(JSON.stringify(body), { status: 200 });
    });

    const result = await fetchAllFirstApiTeams(2025, {
      credentials: { username: 'u', token: 't' },
      fetchImpl: fetchImpl as typeof fetch,
      delayMs: 0,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.map((t) => t.teamNumber)).toEqual([1, 2]);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('fetchFirstApiTeamFromProxy', () => {
  it('maps 503 to credentials_absent without throwing', async () => {
    const fetchImpl = vi.fn(async () => new Response('missing secrets', { status: 503 }));
    const result = await fetchFirstApiTeamFromProxy(2025, 16158, fetchImpl as typeof fetch);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.state).toBe('auth_failure');
      expect(result.diagnostics).toContain('credentials_absent');
    }
  });

  it('returns the matching team listing from the proxy JSON', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('/ftc-api-proxy/2025/teams?teamNumber=16158');
      return new Response(JSON.stringify(sample.teamsPage), { status: 200 });
    });
    const result = await fetchFirstApiTeamFromProxy(2025, 16158, fetchImpl as typeof fetch);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data?.teamNumber).toBe(16158);
      expect(result.data?.schoolName).toBe('Synthetic High School');
    }
  });
});

describe('merge conflict rules (API wins)', () => {
  it('replaces HTML awards when API awards are present', () => {
    const season = baseSeason();
    const { season: merged, replaced } = mergeFirstApiAwardsIntoSeason(
      season,
      sample.awardsFor16158.awards,
      new Map([['USNVFIX', 'Synthetic Nevada Fixture Meet']]),
    );
    expect(replaced).toBe(true);
    expect(merged.awards).toHaveLength(2);
    expect(merged.awards[0]?.name).toBe('Inspire Award Winner');
    expect(merged.awards[0]?.eventName).toBe('Synthetic Nevada Fixture Meet');
    expect(merged.awards.some((a) => a.name === 'HTML-only Award')).toBe(false);
  });

  it('keeps HTML awards when API returns none', () => {
    const season = baseSeason();
    const { season: merged, replaced } = mergeFirstApiAwardsIntoSeason(season, []);
    expect(replaced).toBe(false);
    expect(merged.awards[0]?.name).toBe('HTML-only Award');
  });

  it('prefers API rank and qualification record over HTML', () => {
    const season = baseSeason();
    const ranking = sample.rankingsUSNVFIX.rankings[0]!;
    const { season: merged, rankUpdated, recordUpdated } = mergeFirstApiRankingIntoSeason(
      season,
      'USNVFIX',
      ranking,
    );
    expect(rankUpdated).toBe(true);
    expect(recordUpdated).toBe(true);
    expect(merged.events[0]?.rank).toBe('2');
    expect(merged.events[0]?.rankingScore).toBe(2.5);
    expect(merged.qualificationRecord).toEqual({
      wins: 4,
      losses: 1,
      ties: 0,
      text: '4-1-0',
    });
  });

  it('maps award fixture rows', () => {
    const mapped = mapFirstApiAwardToTeamAward(sample.awardsFor16158.awards[0]!, 'Meet');
    expect(mapped).toMatchObject({
      name: 'Inspire Award Winner',
      eventCode: 'USNVFIX',
      eventName: 'Meet',
    });
  });
});

describe('applyFirstApiCompetitiveEnrichment', () => {
  it('skips network and reports credentials_absent when unset', async () => {
    const fetchImpl = vi.fn();
    const teams = [baseTeam()];
    const result = await applyFirstApiCompetitiveEnrichment(teams, {
      credentials: null,
      fetchImpl,
      delayMs: 0,
    });
    expect(result.result.ok).toBe(false);
    if (!result.result.ok) {
      expect(result.result.diagnostics).toContain('credentials_absent');
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(teams[0]!.seasons[2025]!.awards[0]?.name).toBe('HTML-only Award');
  });

  it('merges awards and rankings from mocked API responses', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/awards/16158')) {
        return new Response(JSON.stringify(sample.awardsFor16158), { status: 200 });
      }
      if (url.includes('/rankings/USNVFIX')) {
        return new Response(JSON.stringify(sample.rankingsUSNVFIX), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });

    const teams = [baseTeam()];
    const result = await applyFirstApiCompetitiveEnrichment(teams, {
      credentials: { username: 'u', token: 't' },
      fetchImpl: fetchImpl as typeof fetch,
      delayMs: 0,
      seasons: [2025],
    });

    expect(result.result.ok).toBe(true);
    expect(result.awardsReplaced).toBe(1);
    expect(result.eventsRankUpdated).toBe(1);
    expect(result.identityVotesAttached).toBe(0);
    expect(teams[0]!.seasons[2025]!.awards[0]?.name).toBe('Inspire Award Winner');
    expect(teams[0]!.seasons[2025]!.events[0]?.rank).toBe('2');
  });

  it('attaches FIRST API identity evidence without overwriting HTML name/org', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/teams') && url.includes('teamNumber=16158')) {
        return new Response(JSON.stringify(sample.teamsPage), { status: 200 });
      }
      if (url.includes('/awards/16158')) {
        return new Response(JSON.stringify(sample.awardsFor16158), { status: 200 });
      }
      if (url.includes('/rankings/USNVFIX')) {
        return new Response(JSON.stringify(sample.rankingsUSNVFIX), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });

    const teams = [baseTeam()];
    const result = await applyFirstApiCompetitiveEnrichment(teams, {
      credentials: { username: 'u', token: 't' },
      fetchImpl: fetchImpl as typeof fetch,
      delayMs: 0,
      seasons: [2025],
    });

    const season = teams[0]!.seasons[2025]!;
    expect(result.identityVotesAttached).toBe(1);
    expect(season.name).toBe('Allsparks');
    expect(season.organization).toBeNull();
    expect(season.evidence?.some((row) => row.sourceType === 'first-api' && row.field === 'name')).toBe(
      true,
    );
    expect(season.evidence?.find((row) => row.sourceType === 'first-api' && row.field === 'name')?.value).toBe(
      'Fixture Allsparks',
    );
  });
});
