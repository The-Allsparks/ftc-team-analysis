import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { Team, TeamLink } from '../data/schema';
import {
  applyGithubRepoEnrichment,
  collectGithubCandidatesFromLinks,
  evaluateGithubSearchOwnership,
  fetchGithubRepoMetadata,
  githubRepoAttribution,
  inferRobotControllerType,
  parseGithubRepoUrl,
  teamNameTokens,
} from './githubRepos';

const FIXTURE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(FIXTURE_DIR, name), 'utf8')) as T;
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
    seasons: {
      2025: {
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
        record: null,
        qualificationRecord: null,
        playoffRecord: null,
        events: [],
        awards: [],
        notes: [],
      },
    },
    ...overrides,
  };
}

describe('parseGithubRepoUrl', () => {
  it('parses owner/repo URLs and rejects profiles / non-repo paths', () => {
    expect(parseGithubRepoUrl('https://github.com/example-oa/16158-code')).toEqual({
      owner: 'example-oa',
      name: '16158-code',
      fullName: 'example-oa/16158-code',
      url: 'https://github.com/example-oa/16158-code',
    });
    expect(parseGithubRepoUrl('https://github.com/example-oa')).toBeNull();
    expect(parseGithubRepoUrl('https://gitlab.com/example/repo')).toBeNull();
    expect(parseGithubRepoUrl('https://github.com/settings/profile')).toBeNull();
  });
});

describe('evaluateGithubSearchOwnership', () => {
  it('rejects number-only false positives', () => {
    const verdict = evaluateGithubSearchOwnership({
      teamNumber: 16158,
      teamName: 'Allsparks',
      hit: {
        htmlUrl: 'https://github.com/random-org/16158',
        fullName: 'random-org/16158',
        description: 'misc scripts',
        matchedOnNumberOnly: true,
      },
    });
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toMatch(/number-only/i);
  });

  it('rejects repo named only after the team number without name corroboration', () => {
    const verdict = evaluateGithubSearchOwnership({
      teamNumber: 16158,
      teamName: 'Allsparks',
      hit: {
        htmlUrl: 'https://github.com/someone/16158',
        fullName: 'someone/16158',
        description: null,
      },
    });
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toMatch(/number-only|beyond team number/i);
  });

  it('accepts number + team-name token corroboration', () => {
    const verdict = evaluateGithubSearchOwnership({
      teamNumber: 16158,
      teamName: 'Allsparks',
      hit: {
        htmlUrl: 'https://github.com/allsparks-ftc/ftc-16158',
        fullName: 'allsparks-ftc/ftc-16158',
        description: 'Allsparks FTC robot code',
      },
    });
    expect(verdict.accepted).toBe(true);
    expect(verdict.evidenceKind).toBe('search-corroborated');
  });

  it('accepts hits already declared on team links', () => {
    const verdict = evaluateGithubSearchOwnership({
      teamNumber: 16158,
      teamName: 'Allsparks',
      hit: {
        htmlUrl: 'https://github.com/example-oa/16158-code',
        fullName: 'example-oa/16158-code',
        matchedOnNumberOnly: true,
      },
      declaredUrls: new Set(['https://github.com/example-oa/16158-code']),
    });
    expect(verdict.accepted).toBe(true);
  });
});

describe('collectGithubCandidatesFromLinks', () => {
  it('collects OA / GM0 / website-declared GitHub code links with evidence kinds', () => {
    const team = baseTeam({
      links: [
        {
          type: 'code',
          label: 'Code',
          url: 'https://github.com/example-oa/16158-code',
          source: 'Open Alliance (team-declared)',
          ownershipConfidence: 'high',
          evidence: 'Exact team number match on Open Alliance',
        },
        {
          type: 'code',
          label: 'Code',
          url: 'https://github.com/example-gm0/16158-code',
          source: 'Game Manual 0 (gallery)',
          ownershipConfidence: 'high',
          evidence: 'Exact team number match on Game Manual 0 gallery',
        },
        {
          type: 'code',
          label: 'GitHub',
          url: 'https://github.com/RoyalGhostbusters/ftc-21535',
          source: 'Team website homepage',
          ownershipConfidence: 'medium',
          evidence: 'Linked from declared team website',
        },
      ],
    });

    const candidates = collectGithubCandidatesFromLinks(team);
    expect(candidates).toHaveLength(3);
    expect(candidates.find((c) => c.fullName === 'example-oa/16158-code')?.evidenceKind).toBe(
      'open-alliance',
    );
    expect(candidates.find((c) => c.fullName === 'example-gm0/16158-code')?.evidenceKind).toBe(
      'gm0-gallery',
    );
    expect(candidates.find((c) => c.fullName.includes('RoyalGhostbusters'))?.evidenceKind).toBe(
      'declared-link',
    );
  });
});

describe('fetchGithubRepoMetadata', () => {
  it('maps public REST payloads and skips private repos (mocked)', async () => {
    const fixture = loadJson<{
      repo: Record<string, unknown>;
      languages: Record<string, number>;
    }>('github-repo-metadata.json');

    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/languages')) {
        return new Response(JSON.stringify(fixture.languages), { status: 200 });
      }
      return new Response(JSON.stringify(fixture.repo), { status: 200 });
    }) as unknown as typeof fetch;

    const metadata = await fetchGithubRepoMetadata('example-oa/16158-code', { fetchImpl });
    expect(metadata?.isPrivate).toBe(false);
    expect(metadata?.languages).toEqual(['Java', 'Kotlin']);
    expect(metadata?.lastActivity).toBe('2026-03-01T12:00:00Z');
    expect(inferRobotControllerType(metadata?.description)).toBe('REV Control Hub');
  });

  it('returns private flag without storing languages for private repos', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ private: true, archived: false }), { status: 200 }),
    ) as unknown as typeof fetch;

    const metadata = await fetchGithubRepoMetadata('secret/private-repo', { fetchImpl });
    expect(metadata?.isPrivate).toBe(true);
    expect(metadata?.languages).toEqual([]);
  });
});

describe('applyGithubRepoEnrichment', () => {
  it('stores verified repos from OA/GM0/declared links with metadata fields', async () => {
    const fixture = loadJson<{
      repo: Record<string, unknown>;
      languages: Record<string, number>;
    }>('github-repo-metadata.json');

    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/languages')) {
        return new Response(JSON.stringify(fixture.languages), { status: 200 });
      }
      if (url.includes('/repos/')) {
        return new Response(JSON.stringify(fixture.repo), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const oaLink: TeamLink = {
      type: 'code',
      label: 'Code',
      url: 'https://github.com/example-oa/16158-code',
      source: 'Open Alliance (team-declared)',
      ownershipConfidence: 'high',
      evidence: 'OA declared Code field',
    };
    const teams = [baseTeam({ links: [oaLink] })];

    const result = await applyGithubRepoEnrichment(teams, {
      retrievedAt: '2026-08-16T12:00:00.000Z',
      fetchImpl,
    });

    expect(result.matchedTeams).toBe(1);
    expect(result.reposAdded).toBe(1);
    const repo = teams[0]!.codeRepositories?.[0];
    expect(repo?.fullName).toBe('example-oa/16158-code');
    expect(repo?.owner).toBe('example-oa');
    expect(repo?.languages).toEqual(['Java', 'Kotlin']);
    expect(repo?.lastActivity).toBe('2026-03-01T12:00:00Z');
    expect(repo?.robotControllerType).toBe('REV Control Hub');
    expect(repo?.evidenceKind).toBe('open-alliance');
    expect(repo?.evidence).toMatch(/Open Alliance/i);
    expect(githubRepoAttribution(repo!)).toMatch(/GitHub \(verified\)/);
  });

  it('rejects number-only search hits while accepting corroborated search', async () => {
    const teams = [baseTeam()];
    const searchHitsByTeam = new Map([
      [
        16158,
        [
          {
            htmlUrl: 'https://github.com/noise/16158',
            fullName: 'noise/16158',
            description: 'unrelated',
            matchedOnNumberOnly: true,
          },
          {
            htmlUrl: 'https://github.com/allsparks-nv/ftc-16158-into-the-deep',
            fullName: 'allsparks-nv/ftc-16158-into-the-deep',
            description: 'Allsparks FTC 2024 code',
          },
        ],
      ],
    ]);

    const result = await applyGithubRepoEnrichment(teams, {
      fetchMetadata: false,
      searchHitsByTeam,
      retrievedAt: '2026-08-16T12:00:00.000Z',
    });

    expect(result.rejectedNumberOnly).toBeGreaterThanOrEqual(1);
    expect(teams[0]!.codeRepositories?.map((repo) => repo.fullName)).toEqual([
      'allsparks-nv/ftc-16158-into-the-deep',
    ]);
    expect(teams[0]!.codeRepositories?.[0]?.evidenceKind).toBe('search-corroborated');
    expect(teams[0]!.codeRepositories?.[0]?.seasons).toContain(2024);
  });
});

describe('teamNameTokens', () => {
  it('drops common FTC stop words', () => {
    expect(teamNameTokens('The Allsparks Robotics Team')).toContain('allsparks');
    expect(teamNameTokens('The Allsparks Robotics Team')).not.toContain('the');
    expect(teamNameTokens('The Allsparks Robotics Team')).not.toContain('team');
  });
});
