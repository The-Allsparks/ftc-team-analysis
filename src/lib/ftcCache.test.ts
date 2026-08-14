import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CACHE_TTL,
  cacheKey,
  clearCachePrefix,
  getCached,
  seasonTtl,
  setCached,
} from './ftcCache';

function installMemoryLocalStorage() {
  const store = new Map<string, string>();

  const localStorage = {
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
  };

  vi.stubGlobal('localStorage', localStorage);
  return store;
}

describe('ftcCache', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = installMemoryLocalStorage();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns null on a cache miss', () => {
    expect(getCached('ftc-cache:v1:missing', 60_000)).toBeNull();
  });

  it('returns data on a cache hit within TTL', () => {
    const key = cacheKey('region', 'USNV', '2025');
    setCached(key, { ok: true, teams: 3 });

    expect(getCached<{ ok: boolean; teams: number }>(key, 60_000)).toEqual({ ok: true, teams: 3 });
  });

  it('returns null and removes the key when the entry is expired', () => {
    const key = cacheKey('team', '21535', '2025');
    setCached(key, { name: 'Royal Ghostbusters' });

    vi.advanceTimersByTime(60_001);

    expect(getCached(key, 60_000)).toBeNull();
    expect(store.has(key)).toBe(false);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('returns null for corrupt JSON without throwing', () => {
    const key = cacheKey('corrupt');
    localStorage.setItem(key, '{not-json');

    expect(getCached(key, 60_000)).toBeNull();
  });

  it('builds prefixed cache keys', () => {
    expect(cacheKey('a', 'b')).toBe('ftc-cache:v1:a:b');
  });

  it('clears keys under a logical prefix', () => {
    setCached(cacheKey('region', 'USNV', '2025'), true);
    setCached(cacheKey('region', 'USNV', '2024'), true);
    setCached(cacheKey('team', '1', '2025'), { n: 1 });

    clearCachePrefix('region');

    expect(getCached(cacheKey('region', 'USNV', '2025'), 60_000)).toBeNull();
    expect(getCached(cacheKey('region', 'USNV', '2024'), 60_000)).toBeNull();
    expect(getCached(cacheKey('team', '1', '2025'), 60_000)).toEqual({ n: 1 });
  });

  it('picks current vs older season TTLs', () => {
    expect(seasonTtl(2026, 2026, CACHE_TTL.currentSeasonRegionMs, CACHE_TTL.olderSeasonRegionMs)).toBe(
      CACHE_TTL.currentSeasonRegionMs,
    );
    expect(seasonTtl(2025, 2026, CACHE_TTL.currentSeasonRegionMs, CACHE_TTL.olderSeasonRegionMs)).toBe(
      CACHE_TTL.currentSeasonRegionMs,
    );
    expect(seasonTtl(2024, 2026, CACHE_TTL.currentSeasonRegionMs, CACHE_TTL.olderSeasonRegionMs)).toBe(
      CACHE_TTL.olderSeasonRegionMs,
    );
  });
});
