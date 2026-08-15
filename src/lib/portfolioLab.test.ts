import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCached } from './ftcCache';
import {
  extractPortfoliosJsonFromHtml,
  fetchPortfolioLabCatalog,
  portfolioLabCatalogCacheKeyForTests,
  searchPortfolioLabTeams,
} from './portfolioLab';
import { parsePortfolioLabEntries } from '../data/portfolioLabSchema';

const FIXTURES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), 'utf8');
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

describe('extractPortfoliosJsonFromHtml', () => {
  it('extracts the current escaped RSC marker and keeps brackets inside strings', () => {
    const html = loadFixture('portfolio-lab-catalog-escaped.html');
    const raw = extractPortfoliosJsonFromHtml(html);
    const parsed = parsePortfolioLabEntries(raw);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.data).toHaveLength(2);
    expect(parsed.data[0]?.summary).toContain('[40-45]');
    expect(parsed.data[0]?.summary).toContain('] mid-string');
    expect(parsed.data[0]?.teamNumber).toBe(99999);
  });

  it('extracts an unescaped portfolios marker variation', () => {
    const html = loadFixture('portfolio-lab-catalog-raw.html');
    const raw = extractPortfoliosJsonFromHtml(html);
    const parsed = parsePortfolioLabEntries(raw);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0]?.teamNumber).toBe(88888);
    expect(parsed.data[0]?.summary).toContain('matrix [1,2,3]');
  });

  it('fails clearly when the catalog marker is missing', () => {
    expect(() => extractPortfoliosJsonFromHtml('<html>no portfolios</html>')).toThrow(
      /catalog marker was not found/,
    );
  });

  it('does not truncate when a string value contains closing brackets', () => {
    const html = `<html>${JSON.stringify({
      portfolios: [
        {
          id: '1',
          teamName: 'Bracket Test',
          teamNumber: 1,
          country: 'USA',
          season: '2025 Decode',
          level: 'Other',
          stars: '*',
          score: '1 / 55',
          award: 'n/a',
          pdf: 'https://example.com/a.pdf',
          summary: 'Ends with ] and has [nested] tokens before more text.',
        },
      ],
    })}</html>`;

    // Naive depth counting would close the array at the first ] inside summary.
    const raw = extractPortfoliosJsonFromHtml(html);
    expect(Array.isArray(raw)).toBe(true);
    expect((raw as unknown[]).length).toBe(1);
  });
});

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

  it('loads a fixture catalog, quarantines bad rows, and caches valid entries', async () => {
    // Inject a malformed sibling after the second entry by rewriting the fixture payload.
    const withBadRow = loadFixture('portfolio-lab-catalog-escaped.html').replace(
      '\\"summary\\":\\"Second valid entry without nested brackets.\\"}]',
      '\\"summary\\":\\"Second valid entry without nested brackets.\\"},{\\"id\\":\\"bad\\",\\"teamNumber\\":\\"x\\"}]',
    );

    vi.mocked(fetch).mockResolvedValue(new Response(withBadRow, { status: 200 }));

    const result = await fetchPortfolioLabCatalog({ force: true });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.state).toBe('available');
    expect(result.data.portfolios).toHaveLength(2);
    expect(result.diagnostics).toMatch(/Quarantined 1/);
    expect(getCached(portfolioLabCatalogCacheKeyForTests(), 60_000)?.portfolios).toHaveLength(2);
  });

  it('maps all-quarantined catalog payloads to parse_failure without caching', async () => {
    const html =
      '<html><script>"portfolios":[{"id":"bad","teamName":"Nope","teamNumber":"x","country":"USA"}]</script></html>';
    vi.mocked(fetch).mockResolvedValue(new Response(html, { status: 200 }));

    const result = await fetchPortfolioLabCatalog({ force: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.state).toBe('parse_failure');
    }
    expect(getCached(portfolioLabCatalogCacheKeyForTests(), 60_000)).toBeNull();
  });
});

describe('searchPortfolioLabTeams', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('validates search hits and maps schema failures to parse_failure', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify([{ id: '1', teamName: 'A', teamNumber: 1, country: 'USA' }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const ok = await searchPortfolioLabTeams('a');
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.data).toHaveLength(1);
    }

    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ not: 'an array' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const bad = await searchPortfolioLabTeams('a');
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.state).toBe('parse_failure');
    }
  });
});
