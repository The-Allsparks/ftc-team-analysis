import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { Team } from '../data/schema';
import {
  GM0_GALLERY_PAGE_URL,
  GM0_SOURCE,
  applyGm0GalleryEnrichment,
  fetchGm0GalleryRst,
  gm0LinkAttribution,
  isGm0LinkSource,
  parseGm0GalleryHtml,
  parseGm0GalleryRst,
  parseGm0TeamHeading,
  teamLinksFromGm0Entry,
} from './gm0Gallery';

const FIXTURES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function loadFixtureText(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), 'utf8');
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

describe('parseGm0TeamHeading', () => {
  it('accepts exact leading team numbers only', () => {
    expect(parseGm0TeamHeading('16158 Fixture Nevada Match')).toEqual({
      teamNumber: 16158,
      teamName: 'Fixture Nevada Match',
      rejectedAsAmbiguous: false,
    });
    expect(parseGm0TeamHeading('3188 Another Exact Match').teamNumber).toBe(3188);
  });

  it('rejects name-only and fuzzy headings (false-match guard)', () => {
    expect(parseGm0TeamHeading('Royal Ghostbusters')).toMatchObject({
      teamNumber: null,
      rejectedAsAmbiguous: true,
    });
    expect(parseGm0TeamHeading('Ambiguous Shared Name')).toMatchObject({
      teamNumber: null,
      rejectedAsAmbiguous: true,
    });
    expect(parseGm0TeamHeading('FTC16158 Prefixed Heading')).toMatchObject({
      teamNumber: null,
      rejectedAsAmbiguous: true,
    });
    expect(parseGm0TeamHeading('16158-B Side Branch')).toMatchObject({
      teamNumber: null,
      rejectedAsAmbiguous: true,
    });
  });
});

describe('parseGm0GalleryRst', () => {
  it('parses fixture RST structure and flags ambiguous headings', () => {
    const { entries, skippedAmbiguous } = parseGm0GalleryRst(loadFixtureText('gm0-gallery.rst'));

    const exact = entries.filter((entry) => entry.teamNumber != null);
    expect(exact.map((entry) => entry.teamNumber)).toEqual([16158, 23400, 3188]);
    expect(skippedAmbiguous).toBeGreaterThanOrEqual(3);

    const nevada = entries.find((entry) => entry.teamNumber === 16158);
    expect(nevada?.seasonLabel).toContain('Into The Deep');
    expect(nevada?.resources.map((resource) => resource.label)).toEqual(
      expect.arrayContaining(['CAD', 'Code', 'Portfolio']),
    );
    expect(nevada?.resources.some((resource) => resource.url.includes('github.com'))).toBe(true);

    const nameOnly = entries.filter((entry) => entry.rejectedAsAmbiguous);
    expect(nameOnly.some((entry) => /Royal Ghostbusters|Ambiguous Shared Name/i.test(entry.heading))).toBe(
      true,
    );
  });
});

describe('parseGm0GalleryHtml', () => {
  it('parses Sphinx-like HTML headings and rejects name-only sections', () => {
    const { entries, skippedAmbiguous } = parseGm0GalleryHtml(loadFixtureText('gm0-gallery.html'));

    expect(entries.filter((entry) => entry.teamNumber != null).map((entry) => entry.teamNumber)).toEqual([
      16158, 3188,
    ]);
    expect(skippedAmbiguous).toBeGreaterThanOrEqual(1);
    expect(entries.some((entry) => entry.heading === 'Ambiguous Shared Name' && entry.rejectedAsAmbiguous)).toBe(
      true,
    );
  });
});

describe('teamLinksFromGm0Entry', () => {
  it('preserves original resource URLs with Game Manual 0 attribution (link not copy)', () => {
    const { entries } = parseGm0GalleryRst(loadFixtureText('gm0-gallery.rst'));
    const entry = entries.find((row) => row.teamNumber === 16158)!;
    const links = teamLinksFromGm0Entry(entry, {
      teamNumber: 16158,
      retrievedAt: '2026-08-16T00:00:00.000Z',
    });

    expect(links.every((link) => link.source === GM0_SOURCE)).toBe(true);
    expect(links.every((link) => link.ownershipConfidence === 'high')).toBe(true);
    expect(links.every((link) => link.evidence?.includes('Exact team number match'))).toBe(true);
    expect(links.every((link) => link.evidence?.includes('not an official competitive result'))).toBe(true);

    const gallery = links.find((link) => link.url === GM0_GALLERY_PAGE_URL);
    expect(gallery?.label).toContain('GM0 Gallery');

    const code = links.find((link) => link.type === 'code');
    expect(code?.url).toBe('https://github.com/example-gm0/16158-code');

    // Fixture intro prose must not be stored as link payloads.
    expect(JSON.stringify(links)).not.toMatch(/Collection of robot designs from past seasons/);
  });
});

describe('applyGm0GalleryEnrichment', () => {
  it('associates only on exact team-number match', () => {
    const { entries } = parseGm0GalleryRst(loadFixtureText('gm0-gallery.rst'));
    const teams = [
      stubTeam(16158, 'Fixture Nevada Match'),
      stubTeam(21535, 'Royal Ghostbusters'),
    ];

    const result = applyGm0GalleryEnrichment(teams, entries, {
      retrievedAt: '2026-08-16T00:00:00.000Z',
    });

    expect(result.matchedTeams).toBe(1);
    expect(result.linksAdded).toBeGreaterThan(0);
    expect(teams[0]!.links.length).toBeGreaterThan(0);
    expect(teams[0]!.links.every((link) => isGm0LinkSource(link.source))).toBe(true);
    expect(teams[1]!.links).toEqual([]);
  });

  it('does not attach from ambiguous name-only gallery headings', () => {
    const teams = [
      stubTeam(21535, 'Royal Ghostbusters'),
      stubTeam(99999, 'Ambiguous Shared Name'),
    ];
    const { entries } = parseGm0GalleryRst(loadFixtureText('gm0-gallery.rst'));
    const ambiguousOnly = entries.filter((entry) => entry.rejectedAsAmbiguous);

    expect(ambiguousOnly.length).toBeGreaterThan(0);

    const result = applyGm0GalleryEnrichment(teams, ambiguousOnly, {
      retrievedAt: '2026-08-16T00:00:00.000Z',
    });

    expect(result.matchedTeams).toBe(0);
    expect(result.linksAdded).toBe(0);
    expect(result.skippedAmbiguous).toBe(ambiguousOnly.length);
    expect(teams.every((team) => team.links.length === 0)).toBe(true);
  });
});

describe('gm0LinkAttribution', () => {
  it('renders source attribution for UI', () => {
    const text = gm0LinkAttribution({
      source: GM0_SOURCE,
      evidence: 'Exact team number match on Game Manual 0 gallery heading',
    });
    expect(text).toContain('Game Manual 0 (gallery)');
    expect(text).toContain('Exact team number match');
  });
});

describe('fetchGm0GalleryRst', () => {
  it('parses a bounded fixture response without live network', async () => {
    const fixture = loadFixtureText('gm0-gallery.rst');
    const fetchImpl = vi.fn(async () => new Response(fixture, { status: 200 })) as unknown as typeof fetch;

    const { entries, skippedAmbiguous } = await fetchGm0GalleryRst({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(entries.some((entry) => entry.teamNumber === 16158)).toBe(true);
    expect(skippedAmbiguous).toBeGreaterThanOrEqual(3);
  });
});
