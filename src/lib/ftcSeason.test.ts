import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SeasonId } from '../data/schema';

const { fetchFtcOkMock } = vi.hoisted(() => ({
  fetchFtcOkMock: vi.fn<(path: string) => Promise<boolean>>(),
}));

vi.mock('./ftcFetch', () => ({
  fetchFtcOk: fetchFtcOkMock,
}));

import { defaultSeasonWithData, resolvePublishedRegionSeason } from './ftcSeason';

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
  it('returns the first season that any team has when the preferred current season is missing', () => {
    const seasons = [2026, 2025, 2024] as SeasonId[];
    const teams = [{ seasons: { 2024: { name: 'Historical' } } }];

    expect(defaultSeasonWithData(seasons, teams)).toBe(2024);
  });

  it('returns the first listed season when a team has that season', () => {
    const seasons = [2026, 2025, 2024] as SeasonId[];
    const teams = [
      { seasons: { 2025: { name: 'Older' } } },
      { seasons: { 2026: { name: 'Current' } } },
    ];

    expect(defaultSeasonWithData(seasons, teams)).toBe(2026);
  });

  it('falls back to the first season <= 2025 when no team has any listed season', () => {
    const seasons = [2026, 2025, 2024] as SeasonId[];
    const teams = [{ seasons: {} }, { seasons: { 2018: { name: 'Out of range' } } }];

    expect(defaultSeasonWithData(seasons, teams)).toBe(2025);
  });

  it('uses seasons[0] when nothing is <= 2025 and no team data matches', () => {
    const seasons = [2026] as SeasonId[];
    expect(defaultSeasonWithData(seasons, [])).toBe(2026);
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
    });
    expect(fetchFtcOkMock).toHaveBeenCalledWith('/2026/region/USNV');
  });

  it('falls back to a published historical season when the preferred season is missing', async () => {
    fetchFtcOkMock.mockImplementation(async (path) => path === '/2025/region/USNV');

    await expect(resolvePublishedRegionSeason('USNV', 2026)).resolves.toEqual({
      season: 2025,
      requestedSeason: 2026,
      usedFallback: true,
    });
    expect(fetchFtcOkMock.mock.calls.map(([path]) => path)).toEqual([
      '/2026/region/USNV',
      '/2025/region/USNV',
    ]);
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
    });
    expect(fetchFtcOkMock).not.toHaveBeenCalled();
  });
});
