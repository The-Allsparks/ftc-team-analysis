import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { Team } from '../data/schema';
import {
  OPEN_ALLIANCE_SOURCE,
  applyOpenAllianceEnrichment,
  fetchOpenAllianceFtcTeamList,
  isOpenAllianceLinkSource,
  openAllianceLinkAttribution,
  parseOpenAllianceFtcListings,
  parseOpenAllianceTeamNumber,
  teamLinksFromOpenAllianceListing,
} from './openAlliance';

const FIXTURES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function loadFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(resolve(FIXTURES_DIR, name), 'utf8')) as unknown;
}

function stubTeam(number: number, name: string): Team {
  return {
    number,
    latestName: name,
    latestLocation: 'Las Vegas, NV, USA',
    latestCity: 'Las Vegas',
    latestState: 'NV',
    latestCountry: 'USA',
    latestRegion: 'Nevada',
    latestLeague: 'Southern Nevada',
    latestRookieYear: 2018,
    latestOrganization: null,
    latestWebsite: null,
    latestTeamType: 'unknown',
    links: [],
    seasons: {},
  };
}

describe('parseOpenAllianceTeamNumber', () => {
  it('accepts exact numeric team numbers only', () => {
    expect(parseOpenAllianceTeamNumber(16158)).toBe(16158);
    expect(parseOpenAllianceTeamNumber('16158')).toBe(16158);
    expect(parseOpenAllianceTeamNumber(' 3188 ')).toBe(3188);
  });

  it('rejects fuzzy, prefixed, and name-like values', () => {
    expect(parseOpenAllianceTeamNumber('16158-B')).toBeNull();
    expect(parseOpenAllianceTeamNumber('FTC16158')).toBeNull();
    expect(parseOpenAllianceTeamNumber('Royal Ghostbusters')).toBeNull();
    expect(parseOpenAllianceTeamNumber('not-a-number')).toBeNull();
    expect(parseOpenAllianceTeamNumber('')).toBeNull();
    expect(parseOpenAllianceTeamNumber(null)).toBeNull();
  });
});

describe('parseOpenAllianceFtcListings', () => {
  it('keeps exact TeamNumber rows and skips non-exact fixture rows', () => {
    const raw = loadFixtureJson('open-alliance-ftc-teams.json');
    const { listings, skippedNonExact } = parseOpenAllianceFtcListings(raw);

    expect(listings.map((row) => row.TeamNumber)).toEqual(['16158', '3188']);
    expect(skippedNonExact).toBe(2);
  });
});

describe('teamLinksFromOpenAllianceListing', () => {
  it('preserves original resource URLs with Open Alliance attribution', () => {
    const raw = loadFixtureJson('open-alliance-ftc-teams.json') as Array<Record<string, unknown>>;
    const listing = parseOpenAllianceFtcListings(raw).listings[0]!;
    const links = teamLinksFromOpenAllianceListing(listing, {
      teamNumber: 16158,
      retrievedAt: '2026-08-16T00:00:00.000Z',
    });

    expect(links.length).toBeGreaterThanOrEqual(4);
    expect(links.every((link) => link.source === OPEN_ALLIANCE_SOURCE)).toBe(true);
    expect(links.every((link) => link.ownershipConfidence === 'high')).toBe(true);
    expect(links.every((link) => link.evidence?.includes('Exact team number match'))).toBe(true);
    expect(links.every((link) => link.evidence?.includes('not an official competitive result'))).toBe(
      true,
    );

    const code = links.find((link) => link.type === 'code');
    expect(code?.url).toBe('https://github.com/example-oa/16158-code');

    const cad = links.find((link) => link.type === 'cad');
    expect(cad?.url).toContain('onshape.com');

    const build = links.find((link) => /build thread/i.test(link.label));
    expect(build?.url).toContain('chiefdelphi.com');
    expect(build?.type).toBe('community');

    // Awards must not become links or competitive rows.
    expect(JSON.stringify(links)).not.toMatch(/People's Choice/);
  });
});

describe('applyOpenAllianceEnrichment', () => {
  it('associates only on exact team-number match', () => {
    const { listings } = parseOpenAllianceFtcListings(loadFixtureJson('open-alliance-ftc-teams.json'));
    const teams = [
      stubTeam(16158, 'Fixture Nevada Match'),
      stubTeam(21535, 'Royal Ghostbusters'),
    ];

    const result = applyOpenAllianceEnrichment(teams, listings, {
      retrievedAt: '2026-08-16T00:00:00.000Z',
    });

    expect(result.matchedTeams).toBe(1);
    expect(result.linksAdded).toBeGreaterThan(0);
    expect(teams[0]!.links.length).toBeGreaterThan(0);
    expect(teams[0]!.links.every((link) => isOpenAllianceLinkSource(link.source))).toBe(true);
    expect(teams[1]!.links).toEqual([]);
  });

  it('does not attach from name-only or fuzzy TeamNumber rows', () => {
    const teams = [stubTeam(21535, 'Royal Ghostbusters')];
    const nameOnlyListings = [
      {
        TeamNumber: 'not-a-number',
        TeamName: 'Royal Ghostbusters',
        Code: 'https://github.com/name-only/should-not-attach',
      },
      {
        TeamNumber: '21535-B',
        TeamID: 'FTC21535',
        TeamName: 'Royal Ghostbusters',
        Code: 'https://github.com/fuzzy/should-not-attach',
      },
    ];

    const parsed = parseOpenAllianceFtcListings(nameOnlyListings);
    expect(parsed.listings).toEqual([]);
    expect(parsed.skippedNonExact).toBe(2);

    const result = applyOpenAllianceEnrichment(teams, nameOnlyListings as never, {
      retrievedAt: '2026-08-16T00:00:00.000Z',
    });

    expect(result.matchedTeams).toBe(0);
    expect(result.linksAdded).toBe(0);
    expect(teams[0]!.links).toEqual([]);
  });
});

describe('openAllianceLinkAttribution', () => {
  it('renders source attribution for UI', () => {
    const text = openAllianceLinkAttribution({
      source: OPEN_ALLIANCE_SOURCE,
      evidence: 'Exact team number match on Open Alliance FTC listing',
    });
    expect(text).toContain('Open Alliance (team-declared)');
    expect(text).toContain('Exact team number match');
  });
});

describe('fetchOpenAllianceFtcTeamList', () => {
  it('parses a bounded fixture response without live network', async () => {
    const fixture = loadFixtureJson('open-alliance-ftc-teams.json');
    const fetchImpl = vi.fn(async () =>
      Response.json(fixture, { status: 200 }),
    ) as unknown as typeof fetch;

    const { listings, skippedNonExact } = await fetchOpenAllianceFtcTeamList({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(listings).toHaveLength(2);
    expect(skippedNonExact).toBe(2);
  });
});
