import { describe, expect, it, vi } from 'vitest';
import type { Team, TeamLink } from '../data/schema';
import {
  applyYoutubeVideoEnrichment,
  collectYoutubeCandidatesFromLinks,
  evaluateYoutubeSearchOwnership,
  fetchYoutubeApiJson,
  fetchYoutubeResourceMetadata,
  inferSeasonHintFromText,
  parseYoutubeUrl,
  readYoutubeApiKey,
  YoutubeResponseCache,
  youtubeResourceAttribution,
} from './youtubeVideos';

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

describe('parseYoutubeUrl', () => {
  it('parses channel, handle, video, and playlist URLs', () => {
    expect(parseYoutubeUrl('https://www.youtube.com/channel/UCabcdef123')).toEqual({
      url: 'https://www.youtube.com/channel/UCabcdef123',
      kind: 'channel',
      channelId: 'UCabcdef123',
      handle: null,
      videoId: null,
      playlistId: null,
    });
    expect(parseYoutubeUrl('https://www.youtube.com/@AllsparksFTC')).toMatchObject({
      kind: 'channel',
      handle: '@allsparksftc',
      url: 'https://www.youtube.com/@allsparksftc',
    });
    expect(parseYoutubeUrl('https://youtu.be/dQw4w9WgXcQ')).toMatchObject({
      kind: 'video',
      videoId: 'dQw4w9WgXcQ',
    });
    expect(parseYoutubeUrl('https://www.youtube.com/playlist?list=PLtest123')).toMatchObject({
      kind: 'playlist',
      playlistId: 'PLtest123',
    });
    expect(parseYoutubeUrl('https://vimeo.com/123')).toBeNull();
  });
});

describe('evaluateYoutubeSearchOwnership', () => {
  it('rejects name-only false positives', () => {
    const verdict = evaluateYoutubeSearchOwnership({
      teamNumber: 16158,
      teamName: 'Allsparks',
      hit: {
        url: 'https://www.youtube.com/@SomeAllsparksFan',
        kind: 'channel',
        title: 'Allsparks highlights',
        description: 'robotics fans',
      },
    });
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toMatch(/name-only/i);
  });

  it('rejects number-only matches without name corroboration', () => {
    const verdict = evaluateYoutubeSearchOwnership({
      teamNumber: 16158,
      teamName: 'Allsparks',
      hit: {
        url: 'https://www.youtube.com/watch?v=abc123XYZ',
        kind: 'video',
        title: 'Team 16158 match',
        description: null,
        matchedOnNumberOnly: true,
      },
    });
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toMatch(/number-only|beyond team number/i);
  });

  it('accepts number + team-name token corroboration', () => {
    const verdict = evaluateYoutubeSearchOwnership({
      teamNumber: 16158,
      teamName: 'Allsparks',
      hit: {
        url: 'https://www.youtube.com/watch?v=reveal16158',
        kind: 'video',
        title: 'Allsparks 16158 robot reveal 2025',
        description: 'FTC Into the Deep',
      },
    });
    expect(verdict.accepted).toBe(true);
    expect(verdict.evidenceKind).toBe('search-corroborated');
  });

  it('accepts hits already declared on team links', () => {
    const verdict = evaluateYoutubeSearchOwnership({
      teamNumber: 16158,
      teamName: 'Allsparks',
      hit: {
        url: 'https://www.youtube.com/@AllsparksFTC',
        kind: 'channel',
        title: 'Allsparks',
        matchedOnNumberOnly: true,
      },
      declaredUrls: new Set(['https://www.youtube.com/@allsparksftc']),
    });
    expect(verdict.accepted).toBe(true);
  });
});

describe('collectYoutubeCandidatesFromLinks', () => {
  it('collects OA / GM0 / website-declared YouTube links with evidence kinds', () => {
    const team = baseTeam({
      links: [
        {
          type: 'video',
          label: 'YouTube',
          url: 'https://www.youtube.com/@OATeamChannel',
          source: 'Open Alliance (team-declared)',
          ownershipConfidence: 'high',
          evidence: 'Exact team number match on Open Alliance',
        },
        {
          type: 'video',
          label: 'YouTube',
          url: 'https://www.youtube.com/channel/UCgm0gallery',
          source: 'Game Manual 0 (gallery)',
          ownershipConfidence: 'high',
          evidence: 'Exact team number match on Game Manual 0 gallery',
        },
        {
          type: 'video',
          label: 'YouTube',
          url: 'https://www.youtube.com/@RoyalGhostbustersFTC',
          source: 'Team website homepage',
          ownershipConfidence: 'medium',
          evidence: 'Linked from declared team website',
        },
      ],
    });

    const candidates = collectYoutubeCandidatesFromLinks(team);
    expect(candidates).toHaveLength(3);
    expect(candidates.find((c) => c.handle === '@oateamchannel')?.evidenceKind).toBe('open-alliance');
    expect(candidates.find((c) => c.channelId === 'UCgm0gallery')?.evidenceKind).toBe('gm0-gallery');
    expect(candidates.find((c) => c.handle === '@royalghostbustersftc')?.evidenceKind).toBe(
      'declared-link',
    );
  });
});

describe('readYoutubeApiKey', () => {
  it('reads YOUTUBE_API_KEY from env and treats empty as absent', () => {
    expect(readYoutubeApiKey({ YOUTUBE_API_KEY: ' test-key ' })).toBe('test-key');
    expect(readYoutubeApiKey({ YOUTUBE_API_KEY: '' })).toBeNull();
    expect(readYoutubeApiKey({})).toBeNull();
  });
});

describe('YoutubeResponseCache', () => {
  it('returns cached values within TTL', () => {
    const cache = new YoutubeResponseCache(60_000);
    cache.set('channels:id:UC1', { items: [{ id: 'UC1' }] });
    expect(cache.get<{ items: unknown[] }>('channels:id:UC1')?.items).toHaveLength(1);
  });
});

describe('fetchYoutubeApiJson quota exhaustion', () => {
  it('maps HTTP 403 quota and 429 to SourceResult failure states', async () => {
    const fetch403 = vi.fn(async () =>
      new Response(JSON.stringify({ error: { errors: [{ reason: 'quotaExceeded' }] } }), {
        status: 403,
      }),
    ) as unknown as typeof fetch;

    const quota = await fetchYoutubeApiJson('/channels?part=snippet&id=UC1', {
      apiKey: 'test-key',
      fetchImpl: fetch403,
    });
    expect(quota.ok).toBe(false);
    if (!quota.ok) {
      expect(quota.state).toBe('rate_limited');
    }

    const fetch429 = vi.fn(async () =>
      new Response('Too Many Requests', { status: 429 }),
    ) as unknown as typeof fetch;

    const limited = await fetchYoutubeApiJson('/videos?part=snippet&id=abc', {
      apiKey: 'test-key',
      fetchImpl: fetch429,
    });
    expect(limited.ok).toBe(false);
    if (!limited.ok) {
      expect(limited.state).toBe('rate_limited');
    }
  });

  it('serves cache hits without a second network call', async () => {
    const cache = new YoutubeResponseCache();
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ items: [{ id: 'UC1', snippet: { title: 'Channel' } }] }), {
        status: 200,
      }),
    ) as unknown as typeof fetch;

    const first = await fetchYoutubeApiJson('/channels?part=snippet&id=UC1', {
      apiKey: 'test-key',
      fetchImpl,
      cache,
      cacheKey: 'channels:id:UC1',
    });
    const second = await fetchYoutubeApiJson('/channels?part=snippet&id=UC1', {
      apiKey: 'test-key',
      fetchImpl,
      cache,
      cacheKey: 'channels:id:UC1',
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.diagnostics).toBe('cache-hit');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('fetchYoutubeResourceMetadata', () => {
  it('skips the network when no API key is configured', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const result = await fetchYoutubeResourceMetadata(
      {
        url: 'https://www.youtube.com/channel/UC1',
        kind: 'channel',
        channelId: 'UC1',
        handle: null,
        videoId: null,
        playlistId: null,
      },
      { apiKey: null, fetchImpl },
    );
    expect(result.metadata).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('applyYoutubeVideoEnrichment', () => {
  it('stores verified resources from declared links without an API key', async () => {
    const oaLink: TeamLink = {
      type: 'video',
      label: 'YouTube',
      url: 'https://www.youtube.com/@AllsparksFTC',
      source: 'Open Alliance (team-declared)',
      ownershipConfidence: 'high',
      evidence: 'OA declared media field',
    };
    const teams = [baseTeam({ links: [oaLink] })];

    const result = await applyYoutubeVideoEnrichment(teams, {
      retrievedAt: '2026-08-16T12:00:00.000Z',
      apiKey: null,
    });

    expect(result.matchedTeams).toBe(1);
    expect(result.resourcesAdded).toBe(1);
    expect(result.apiCalls).toBe(0);
    const resource = teams[0]!.videoResources?.[0];
    expect(resource?.kind).toBe('channel');
    expect(resource?.evidenceKind).toBe('open-alliance');
    expect(resource?.evidence).toMatch(/Open Alliance/i);
    expect(youtubeResourceAttribution(resource!)).toMatch(/YouTube \(verified\)/);
  });

  it('rejects name-only search hits while accepting corroborated search', async () => {
    const teams = [baseTeam()];
    const searchHitsByTeam = new Map([
      [
        16158,
        [
          {
            url: 'https://www.youtube.com/@AllsparksFans',
            kind: 'channel' as const,
            title: 'Allsparks fans',
            description: 'unofficial',
          },
          {
            url: 'https://www.youtube.com/watch?v=reveal2024',
            kind: 'video' as const,
            title: 'Allsparks 16158 robot reveal 2024',
            description: 'Into the Deep',
          },
        ],
      ],
    ]);

    const result = await applyYoutubeVideoEnrichment(teams, {
      apiKey: null,
      searchHitsByTeam,
      retrievedAt: '2026-08-16T12:00:00.000Z',
    });

    expect(result.rejectedNameOnly).toBeGreaterThanOrEqual(1);
    expect(teams[0]!.videoResources?.map((resource) => resource.url)).toEqual([
      'https://www.youtube.com/watch?v=reveal2024',
    ]);
    expect(teams[0]!.videoResources?.[0]?.evidenceKind).toBe('search-corroborated');
    expect(teams[0]!.videoResources?.[0]?.seasonHint).toBe(2024);
  });

  it('surfaces quota exhaustion as SourceResult failure while keeping declared resources', async () => {
    const teams = [
      baseTeam({
        links: [
          {
            type: 'video',
            label: 'YouTube',
            url: 'https://www.youtube.com/channel/UCdeclared1',
            source: 'Team website homepage',
            ownershipConfidence: 'high',
            evidence: 'Declared website link',
          },
        ],
      }),
    ];

    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: { errors: [{ reason: 'dailyLimitExceeded' }] } }), {
        status: 403,
      }),
    ) as unknown as typeof fetch;

    const result = await applyYoutubeVideoEnrichment(teams, {
      apiKey: 'test-key',
      fetchImpl,
      retrievedAt: '2026-08-16T12:00:00.000Z',
    });

    expect(result.apiFailure?.ok).toBe(false);
    if (result.apiFailure && !result.apiFailure.ok) {
      expect(result.apiFailure.state).toBe('rate_limited');
    }
    expect(teams[0]!.videoResources).toHaveLength(1);
    expect(teams[0]!.videoResources?.[0]?.url).toBe('https://www.youtube.com/channel/UCdeclared1');
    expect(teams[0]!.videoResources?.[0]?.title).toBe('YouTube');
  });

  it('enriches metadata from Data API when a key is present', async () => {
    const teams = [
      baseTeam({
        links: [
          {
            type: 'video',
            label: 'YouTube',
            url: 'https://www.youtube.com/watch?v=abcXYZ12',
            source: 'Team website homepage',
            ownershipConfidence: 'medium',
          },
        ],
      }),
    ];

    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          items: [
            {
              id: 'abcXYZ12',
              snippet: {
                title: 'Allsparks 16158 Reveal 2025',
                publishedAt: '2025-09-01T00:00:00Z',
                description: 'Robot reveal',
                channelId: 'UCchannel1',
              },
            },
          ],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const result = await applyYoutubeVideoEnrichment(teams, {
      apiKey: 'test-key',
      fetchImpl,
      retrievedAt: '2026-08-16T12:00:00.000Z',
    });

    expect(result.apiCalls).toBe(1);
    expect(teams[0]!.videoResources?.[0]?.title).toBe('Allsparks 16158 Reveal 2025');
    expect(teams[0]!.videoResources?.[0]?.publishedAt).toBe('2025-09-01T00:00:00Z');
    expect(teams[0]!.videoResources?.[0]?.seasonHint).toBe(2025);
    expect(inferSeasonHintFromText('Season 2024 Into the Deep')).toBe(2024);
  });
});
