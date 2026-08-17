import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeneratedData, SeasonId } from '../data/schema';
import { cacheKey, setCached } from './ftcCache';

const { fetchFtcOkMock } = vi.hoisted(() => ({
  fetchFtcOkMock: vi.fn<(path: string) => Promise<boolean>>(),
}));

vi.mock('./ftcFetch', () => ({
  fetchFtcOk: fetchFtcOkMock,
  fetchFtcHtml: vi.fn(),
}));

import { seasonHasTeamData, shouldAutoRefreshRegion } from './ftcLive';

function emptyData(overrides: Partial<GeneratedData> = {}): GeneratedData {
  return {
    generatedAt: '2026-08-14T00:00:00.000Z',
    targetSeasons: [2025, 2024] as SeasonId[],
    regionCode: 'USNV',
    teams: [],
    regionEvents: [],
    sources: [],
    limitations: [],
    ...overrides,
  };
}

function installMemoryLocalStorage() {
  const store = new Map<string, string>();

  vi.stubGlobal('localStorage', {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    get length() {
      return store.size;
    },
  });
}

describe('seasonHasTeamData / shouldAutoRefreshRegion', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    fetchFtcOkMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects when a season has no team rows', () => {
    const data = emptyData({
      teams: [
        {
          number: 1,
          latestName: 'A',
          latestLocation: 'NV',
          latestCity: null,
          latestState: 'NV',
          latestCountry: 'USA',
          latestRookieYear: null,
          latestOrganization: null,
          latestWebsite: null,
          latestTeamType: 'unknown',
          latestLeague: null,
          latestRegion: 'Nevada',
          links: [],
          seasons: {
            2025: {
              season: 2025,
              active: true,
              name: 'A',
              location: 'NV',
              city: null,
              state: 'NV',
              country: 'USA',
              region: 'Nevada',
              league: null,
              rookieYear: null,
              organization: null,
              teamType: 'unknown',
              website: null,
              robot: null,
              sourceUrl: 'https://example.test',
              summary: null,
              record: null,
              qualificationRecord: null,
              playoffRecord: null,
              events: [],
              awards: [],
              notes: [],
            },
          },
        },
      ],
    });

    expect(seasonHasTeamData(data, 2026)).toBe(false);
    expect(seasonHasTeamData(data, 2025)).toBe(true);
  });

  it('auto-refreshes when the season dataset is empty even if a region cache exists', () => {
    setCached(cacheKey('region', 'USNV', '2026'), { teams: [] });
    expect(shouldAutoRefreshRegion(2026, emptyData())).toBe(true);
  });

  it('skips auto-refresh when season data exists (static-first; live cache not required)', () => {
    const data = emptyData({
      teams: [
        {
          number: 1,
          latestName: 'A',
          latestLocation: 'NV',
          latestCity: null,
          latestState: 'NV',
          latestCountry: 'USA',
          latestRookieYear: null,
          latestOrganization: null,
          latestWebsite: null,
          latestTeamType: 'unknown',
          latestLeague: null,
          latestRegion: 'Nevada',
          links: [],
          seasons: {
            2026: {
              season: 2026,
              active: true,
              name: 'A',
              location: 'NV',
              city: null,
              state: 'NV',
              country: 'USA',
              region: 'Nevada',
              league: null,
              rookieYear: null,
              organization: null,
              teamType: 'unknown',
              website: null,
              robot: null,
              sourceUrl: 'https://example.test',
              summary: null,
              record: null,
              qualificationRecord: null,
              playoffRecord: null,
              events: [],
              awards: [],
              notes: [],
            },
          },
        },
      ],
    });

    expect(shouldAutoRefreshRegion(2026, data)).toBe(false);
  });
});
