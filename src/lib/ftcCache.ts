const CACHE_PREFIX = 'ftc-cache:v1';

type CacheEnvelope<T> = {
  fetchedAt: number;
  data: T;
};

export function cacheKey(...parts: string[]): string {
  return `${CACHE_PREFIX}:${parts.join(':')}`;
}

export function getCached<T>(key: string, ttlMs: number): T | null {
  try {
    const raw = localStorage.getItem(key);

    if (!raw) {
      return null;
    }

    const envelope = JSON.parse(raw) as CacheEnvelope<T>;

    if (Date.now() - envelope.fetchedAt > ttlMs) {
      localStorage.removeItem(key);
      return null;
    }

    return envelope.data;
  } catch {
    return null;
  }
}

export function setCached<T>(key: string, data: T): void {
  try {
    const envelope: CacheEnvelope<T> = {
      fetchedAt: Date.now(),
      data,
    };

    localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Ignore quota errors; the app still works from the bundled snapshot.
  }
}

export function clearCachePrefix(prefix: string): void {
  const fullPrefix = cacheKey(prefix);

  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);

    if (key?.startsWith(fullPrefix)) {
      localStorage.removeItem(key);
    }
  }
}

export const CACHE_TTL = {
  currentSeasonRegionMs: 15 * 60 * 1000,
  currentSeasonTeamMs: 30 * 60 * 1000,
  olderSeasonRegionMs: 24 * 60 * 60 * 1000,
  olderSeasonTeamMs: 7 * 24 * 60 * 60 * 1000,
} as const;

export function seasonTtl(season: number, latestSeason: number, current: number, older: number): number {
  return season >= latestSeason - 1 ? current : older;
}
