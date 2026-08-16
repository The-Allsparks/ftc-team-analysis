import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SeasonId } from '../data/schema';

const { fetchFtcOkMock } = vi.hoisted(() => ({
  fetchFtcOkMock: vi.fn<(path: string) => Promise<boolean>>(),
}));

vi.mock('./ftcFetch', () => ({
  fetchFtcOk: fetchFtcOkMock,
}));

import {
  defaultSeasonWithData,
  initialSeasonFilter,
  resolvePublishedRegionSeason,
} from './ftcSeason';

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

describe('defaultSeasonWithData', () => {
  it('prefers the newest listed season even when no team has that season yet', () => {
    const seasons = [2026, 2025, 2024] as SeasonId[];
    const teams = [{ seasons: { 2024: { name: 'Historical' } } }];

    expect(defaultSeasonWithData(seasons, teams)).toBe(2026);
  });

  it('returns the first listed season when a team has that season', () => {
    const seasons = [2026, 2025, 2024] as SeasonId[];
    const teams = [
      { seasons: { 2025: { name: 'Older' } } },
      { seasons: { 2026: { name: 'Current' } } },
    ];

    expect(defaultSeasonWithData(seasons, teams)).toBe(2026);
  });

  it('falls back to CURRENT_SEASON when the season list is empty', () => {
    expect(defaultSeasonWithData([])).toBe(2026);
  });
});

describe('initialSeasonFilter', () => {
  it('selects the newest season that already has team data', () => {
    expect(
      initialSeasonFilter({
        targetSeasons: [2026, 2025],
        teams: [{ seasons: { 2025: {}, 2024: {} } }],
      }),
    ).toBe(2025);
  });
});

describe('resolvePublishedRegionSeason', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    fetchFtcOkMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the preferred season when it is published', async () => {
    fetchFtcOkMock.mockImplementation(async (path) => path === '/2026/region/USNV');

    await expect(resolvePublishedRegionSeason('USNV', 2026)).resolves.toEqual({
      season: 2026,
      requestedSeason: 2026,
      usedFallback: false,
      status: 'published',
    });
    expect(fetchFtcOkMock).toHaveBeenCalledWith('/2026/region/USNV');
  });

  it('falls back to a published historical season when the preferred season is missing', async () => {
    fetchFtcOkMock.mockImplementation(async (path) => path === '/2025/region/USNV');

    await expect(
      resolvePublishedRegionSeason('USNV', 2026, {
        targetSeasons: [2026, 2025],
        teams: [{ seasons: { 2025: {} } }],
      }),
    ).resolves.toEqual({
      season: 2025,
      requestedSeason: 2026,
      usedFallback: true,
      status: 'fallback',
    });
    expect(fetchFtcOkMock.mock.calls.map(([path]) => path)).toEqual([
      '/2026/region/USNV',
      '/2025/region/USNV',
    ]);
  });

  it('labels unpublished current via usedFallback rather than inventing empty success', async () => {
    fetchFtcOkMock.mockImplementation(async (path) => path === '/2024/region/USNV');

    const resolved = await resolvePublishedRegionSeason('USNV', 2026, {
      targetSeasons: [2025, 2024],
      teams: [{ seasons: { 2024: {} } }],
    });

    expect(resolved).toMatchObject({
      season: 2024,
      requestedSeason: 2026,
      usedFallback: true,
      status: 'fallback',
    });
  });

  it('throws when no region season pages are published', async () => {
    fetchFtcOkMock.mockResolvedValue(false);

    await expect(resolvePublishedRegionSeason('USNV', 2026)).rejects.toThrow(
      /No published FTC Events region pages were found for USNV/,
    );
  });

  it('uses cached publish checks without calling fetch again', async () => {
    fetchFtcOkMock.mockResolvedValue(true);

    await resolvePublishedRegionSeason('USNV', 2026);
    fetchFtcOkMock.mockClear();

    await expect(resolvePublishedRegionSeason('USNV', 2026)).resolves.toEqual({
      season: 2026,
      requestedSeason: 2026,
      usedFallback: false,
      status: 'published',
    });
    expect(fetchFtcOkMock).not.toHaveBeenCalled();
  });
});
