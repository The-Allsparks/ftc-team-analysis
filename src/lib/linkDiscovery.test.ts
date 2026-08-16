import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { Team } from '../data/schema';
import {
  checkLinkLiveness,
  countTeamsWithVerifiedLink,
  discoverLinksForWebsite,
  extractSitemapLocs,
  extractSitemapUrlsFromRobots,
  looksLikePersonalOrStudentAccount,
  normalizeLinkUrl,
  preferDiscoveryPaths,
} from './linkDiscovery';

const FIXTURES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), 'utf8');
}

const TEAM: Team = {
  number: 21535,
  latestName: 'Royal Ghostbusters',
  latestLocation: 'Las Vegas, NV, USA',
  latestCity: 'Las Vegas',
  latestState: 'NV',
  latestCountry: 'USA',
  latestRegion: 'Nevada',
  latestLeague: 'Southern Nevada',
  latestRookieYear: 2022,
  latestOrganization: null,
  latestWebsite: 'https://example-team.example',
  latestTeamType: 'unknown',
  links: [],
  seasons: {
    2025: {
      season: 2025,
      active: true,
      name: 'Royal Ghostbusters',
      location: 'Las Vegas, NV, USA',
      city: 'Las Vegas',
      state: 'NV',
      country: 'USA',
      region: 'Nevada',
      league: 'Southern Nevada',
      rookieYear: 2022,
      organization: null,
      website: 'https://example-team.example',
      teamType: 'unknown',
      robot: null,
      sourceUrl: 'https://ftc-events.firstinspires.org/2025/team/21535',
      summary: null,
      record: null,
      qualificationRecord: null,
      playoffRecord: null,
      events: [],
      awards: [],
      notes: [],
    },
  },
};

describe('normalizeLinkUrl', () => {
  it('strips tracking params, upgrades http, and normalizes trailing slashes', () => {
    expect(normalizeLinkUrl('http://Example.COM/about/?utm_source=x&fbclid=1&ref=nav#section')).toBe(
      'https://example.com/about',
    );
  });

  it('rejects mailto and javascript URLs', () => {
    expect(normalizeLinkUrl('mailto:coach@example.com')).toBeNull();
    expect(normalizeLinkUrl('javascript:void(0)')).toBeNull();
  });

  it('resolves relative hrefs against a base', () => {
    expect(normalizeLinkUrl('/sponsors/', 'https://example-team.example/')).toBe(
      'https://example-team.example/sponsors',
    );
  });
});

describe('looksLikePersonalOrStudentAccount', () => {
  it('filters personal social patterns and mailto', () => {
    expect(looksLikePersonalOrStudentAccount('mailto:emma@school.edu')).toBe(true);
    expect(looksLikePersonalOrStudentAccount('https://www.instagram.com/emma.smith/')).toBe(true);
    expect(looksLikePersonalOrStudentAccount('https://www.tiktok.com/@jake')).toBe(true);
    expect(looksLikePersonalOrStudentAccount('https://www.linkedin.com/in/jane-doe-student/')).toBe(true);
    expect(looksLikePersonalOrStudentAccount('https://www.facebook.com/profile.php?id=123')).toBe(true);
  });

  it('keeps team-number and robotics social accounts', () => {
    expect(looksLikePersonalOrStudentAccount('https://www.instagram.com/royalghostbustersftc/', TEAM)).toBe(
      false,
    );
    expect(looksLikePersonalOrStudentAccount('https://www.tiktok.com/@ghostbusters.ftc', TEAM)).toBe(false);
    expect(looksLikePersonalOrStudentAccount('https://www.instagram.com/team21535/', TEAM)).toBe(false);
    expect(looksLikePersonalOrStudentAccount('https://github.com/RoyalGhostbusters/ftc-21535', TEAM)).toBe(
      false,
    );
  });
});

describe('sitemap and robots extraction', () => {
  it('parses same-origin sitemap locs and ignores other hosts', () => {
    const locs = extractSitemapLocs(loadFixture('link-discovery-sitemap.xml'), 'https://example-team.example');
    expect(locs).toContain('https://example-team.example/about');
    expect(locs).toContain('https://example-team.example/links');
    expect(locs.some((url) => url.includes('other.example'))).toBe(false);
  });

  it('reads Sitemap lines from robots.txt', () => {
    expect(extractSitemapUrlsFromRobots(loadFixture('link-discovery-robots.txt'), 'https://example-team.example')).toEqual([
      'https://example-team.example/sitemap.xml',
    ]);
  });

  it('prefers common discovery paths from sitemap locs', () => {
    const locs = extractSitemapLocs(loadFixture('link-discovery-sitemap.xml'), 'https://example-team.example');
    const preferred = preferDiscoveryPaths(locs, 'https://example-team.example');
    expect(preferred[0]).toMatch(/about|sponsors|robots|resources|contact|links/);
    expect(preferred).not.toContain('https://example-team.example/blog/post-1');
  });
});

describe('checkLinkLiveness', () => {
  it('marks 404/410 as dead and 200 as alive', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('missing')) {
        return new Response('', { status: 404 });
      }
      if (url.includes('gone')) {
        return new Response('', { status: 410 });
      }
      if (init?.method === 'HEAD') {
        return new Response('', { status: 200 });
      }
      return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;

    await expect(
      checkLinkLiveness('https://example-team.example/missing', {
        fetchImpl,
        now: () => '2026-08-16T00:00:00.000Z',
      }),
    ).resolves.toMatchObject({ liveness: 'dead', httpStatus: 404 });

    await expect(
      checkLinkLiveness('https://example-team.example/gone', {
        fetchImpl,
        now: () => '2026-08-16T00:00:00.000Z',
      }),
    ).resolves.toMatchObject({ liveness: 'dead', httpStatus: 410 });

    await expect(
      checkLinkLiveness('https://example-team.example/', {
        fetchImpl,
        now: () => '2026-08-16T00:00:00.000Z',
      }),
    ).resolves.toMatchObject({ liveness: 'alive', httpStatus: 200 });
  });

  it('falls back to GET when HEAD is not allowed', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        return new Response('', { status: 405 });
      }
      return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;

    await expect(
      checkLinkLiveness('https://example-team.example/about', {
        fetchImpl,
        now: () => '2026-08-16T00:00:00.000Z',
      }),
    ).resolves.toMatchObject({ liveness: 'alive', httpStatus: 200 });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('returns unknown on network failure', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('network down');
    }) as unknown as typeof fetch;

    await expect(
      checkLinkLiveness('https://example-team.example/', {
        fetchImpl,
        now: () => '2026-08-16T00:00:00.000Z',
      }),
    ).resolves.toMatchObject({ liveness: 'unknown', httpStatus: null });
  });
});

describe('discoverLinksForWebsite', () => {
  it('extracts hub/social/code links from homepage, about path, sitemap, and link hub while filtering personal accounts', async () => {
    const home = loadFixture('link-discovery-home.html');
    const about = loadFixture('link-discovery-about.html');
    const hub = loadFixture('link-discovery-linkhub.html');
    const robots = loadFixture('link-discovery-robots.txt');
    const sitemap = loadFixture('link-discovery-sitemap.xml');

    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === 'https://example-team.example' || url === 'https://example-team.example/') {
        return new Response(home, { status: 200, headers: { 'content-type': 'text/html' } });
      }
      if (url === 'https://example-team.example/robots.txt') {
        return new Response(robots, { status: 200, headers: { 'content-type': 'text/plain' } });
      }
      if (url === 'https://example-team.example/sitemap.xml') {
        return new Response(sitemap, { status: 200, headers: { 'content-type': 'application/xml' } });
      }
      if (url === 'https://example-team.example/about') {
        return new Response(about, { status: 200, headers: { 'content-type': 'text/html' } });
      }
      if (url === 'https://linktr.ee/royalghostbustersftc') {
        return new Response(hub, { status: 200, headers: { 'content-type': 'text/html' } });
      }
      if (url.startsWith('https://example-team.example/')) {
        return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } });
      }
      return new Response('missing', { status: 404 });
    }) as unknown as typeof fetch;

    const links = await discoverLinksForWebsite('https://example-team.example', TEAM, {
      fetchImpl,
      checkLiveness: false,
      now: () => '2026-08-16T12:00:00.000Z',
    });

    const urls = links.map((link) => link.url);

    expect(urls).toContain('https://example-team.example');
    expect(urls).toContain('https://github.com/RoyalGhostbusters/ftc-21535');
    expect(urls).toContain('https://www.youtube.com/@RoyalGhostbustersFTC');
    expect(urls).toContain('https://www.instagram.com/royalghostbustersftc');
    expect(urls).toContain('https://linktr.ee/royalghostbustersftc');
    expect(urls).toContain('https://www.tiktok.com/@ghostbusters.ftc');
    expect(urls).toContain('https://x.com/GhostbustersFTC');
    expect(urls).toContain('https://github.com/RoyalGhostbusters/cad-21535');
    expect(urls).toContain('https://discord.gg/royalghostbusters');

    expect(urls.some((url) => /emma\.smith|@jake|sarah\.jones|linkedin\.com\/in\//i.test(url))).toBe(false);
    expect(urls.some((url) => url.startsWith('mailto:'))).toBe(false);

    const website = links.find((link) => link.url === 'https://example-team.example');
    expect(website?.ownershipConfidence).toBe('high');
    expect(website?.evidence).toMatch(/On The Web/i);

    const github = links.find((link) => link.url.includes('github.com/RoyalGhostbusters/ftc-21535'));
    expect(github?.ownershipConfidence).toMatch(/medium|high|low/);
    expect(github?.source).toBeTruthy();
    expect(github?.retrievedAt).toBe('2026-08-16T12:00:00.000Z');

    // Fixture corpus coverage: shallow homepage-only would miss about + hub outs.
    const shallowOnly = new Set([
      'https://example-team.example',
      'https://github.com/RoyalGhostbusters/ftc-21535',
      'https://www.youtube.com/@RoyalGhostbustersFTC',
      'https://www.instagram.com/royalghostbustersftc',
      'https://linktr.ee/royalghostbustersftc',
    ]);
    const expandedExtras = urls.filter((url) => !shallowOnly.has(url));
    expect(expandedExtras.length).toBeGreaterThan(0);

    expect(
      countTeamsWithVerifiedLink([{ links }, { links: [] }, { links: [{ ...links[0], liveness: 'dead' }] }]),
    ).toBe(1);
  });

  it('keeps a dead On The Web URL with liveness flags instead of dropping it', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('instagram.com') && init?.method === 'HEAD') {
        return new Response('', { status: 404 });
      }
      if (url.includes('instagram.com')) {
        return new Response('', { status: 404 });
      }
      return new Response('missing', { status: 404 });
    }) as unknown as typeof fetch;

    const links = await discoverLinksForWebsite('https://www.instagram.com/royalghostbustersftc', TEAM, {
      fetchImpl,
      checkLiveness: true,
      now: () => '2026-08-16T12:00:00.000Z',
    });

    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      url: 'https://www.instagram.com/royalghostbustersftc',
      ownershipConfidence: 'high',
      liveness: 'dead',
      httpStatus: 404,
    });
  });
});
