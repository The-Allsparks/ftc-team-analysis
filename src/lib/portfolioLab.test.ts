import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCached } from './ftcCache';
import {
  fetchPortfolioLabCatalog,
  portfolioLabCatalogCacheKeyForTests,
} from './portfolioLab';

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

describe('fetchPortfolioLabCatalog', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps 429/5xx to failure states without caching', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('slow', { status: 429 }));

    const limited = await fetchPortfolioLabCatalog({ force: true });
    expect(limited.ok).toBe(false);
    if (!limited.ok) {
      expect(limited.state).toBe('rate_limited');
    }
    expect(getCached(portfolioLabCatalogCacheKeyForTests(), 60_000)).toBeNull();

    vi.mocked(fetch).mockResolvedValue(new Response('down', { status: 500 }));
    const unavailable = await fetchPortfolioLabCatalog({ force: true });
    expect(unavailable.ok).toBe(false);
    if (!unavailable.ok) {
      expect(unavailable.state).toBe('upstream_unavailable');
    }
    expect(getCached(portfolioLabCatalogCacheKeyForTests(), 60_000)).toBeNull();
  });

  it('maps missing catalog marker to parse_failure without caching', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('<html>no portfolios</html>', { status: 200 }));

    const result = await fetchPortfolioLabCatalog({ force: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.state).toBe('parse_failure');
    }
    expect(getCached(portfolioLabCatalogCacheKeyForTests(), 60_000)).toBeNull();
  });
});
