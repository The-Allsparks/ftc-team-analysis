import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCached } from './ftcCache';
import { fetchTeamScoutData, scoutTeamCacheKeyForTests } from './ftcScout';

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

  return store;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const sampleQuickStats = {
  season: 2025,
  number: 16158,
  tot: { value: 100, rank: 1 },
  auto: { value: 40, rank: 2 },
  dc: { value: 40, rank: 3 },
  eg: { value: 20, rank: 4 },
  count: 10,
};

describe('fetchTeamScoutData', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('caches successful payloads including legitimate empty 404 arms', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('quick-stats')) {
        return jsonResponse(404, { message: 'missing' });
      }
      return jsonResponse(404, { message: 'missing' });
    });

    const result = await fetchTeamScoutData(2025, 16158, { force: true });
    const key = scoutTeamCacheKeyForTests(2025, 16158);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state).toBe('no_record');
      expect(result.data.quickStats).toBeNull();
      expect(result.data.events).toEqual([]);
    }
    expect(getCached(key, 60_000)).toEqual(result.ok ? result.data : null);
  });

  it('does not cache 429 or 5xx failures as successful empties', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async () => jsonResponse(429, { message: 'slow down' }));

    const limited = await fetchTeamScoutData(2025, 16158, { force: true });
    const key = scoutTeamCacheKeyForTests(2025, 16158);

    expect(limited.ok).toBe(false);
    if (!limited.ok) {
      expect(limited.state).toBe('rate_limited');
      expect(limited.data?.quickStats).toBeNull();
      expect(limited.data?.events).toEqual([]);
    }
    expect(getCached(key, 60_000)).toBeNull();

    fetchMock.mockImplementation(async () => jsonResponse(503, { message: 'down' }));
    const unavailable = await fetchTeamScoutData(2025, 99999, { force: true });
    expect(unavailable.ok).toBe(false);
    if (!unavailable.ok) {
      expect(unavailable.state).toBe('upstream_unavailable');
    }
    expect(getCached(scoutTeamCacheKeyForTests(2025, 99999), 60_000)).toBeNull();
  });

  it('preserves fulfilled arm data on partial hard failure without caching', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('quick-stats')) {
        return jsonResponse(200, sampleQuickStats);
      }
      return jsonResponse(503, { message: 'events down' });
    });

    const result = await fetchTeamScoutData(2025, 16158, { force: true });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.state).toBe('upstream_unavailable');
      expect(result.data?.quickStats?.tot.value).toBe(100);
      expect(result.data?.events).toEqual([]);
    }
    expect(getCached(scoutTeamCacheKeyForTests(2025, 16158), 60_000)).toBeNull();
  });

  it('caches available data when both arms succeed', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('quick-stats')) {
        return jsonResponse(200, sampleQuickStats);
      }
      return jsonResponse(200, [
        {
          season: 2025,
          eventCode: 'USNVCMP',
          teamNumber: 16158,
          stats: null,
        },
      ]);
    });

    const result = await fetchTeamScoutData(2025, 16158, { force: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state).toBe('available');
      expect(result.data.events).toHaveLength(1);
    }
    expect(getCached(scoutTeamCacheKeyForTests(2025, 16158), 60_000)).toEqual(result.ok ? result.data : null);
  });
});
