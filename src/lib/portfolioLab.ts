import {
  PORTFOLIO_LAB_BASE_URL,
  PORTFOLIO_LAB_CATALOG_URL,
  PortfolioLabCatalog,
  PortfolioLabEntry,
  portfolioSeasonId,
} from '../data/portfolioLab';
import {
  formatPortfolioLabIssues,
  parsePortfolioLabEntries,
  parsePortfolioLabSearchHits,
  PortfolioLabSearchHit,
} from '../data/portfolioLabSchema';
import { cacheKey, getCached, setCached } from './ftcCache';
import {
  failureFromHttpStatus,
  failureFromUnknown,
  isCacheableSuccess,
  SourceResult,
} from './sourceResult';

const PORTFOLIO_CACHE_KEY = cacheKey('portfolio-lab', 'catalog');
const PORTFOLIO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PORTFOLIO_PROXY_PREFIX = '/portfolio-lab-proxy';
const PORTFOLIO_SOURCE_LABEL = 'Portfolio Lab';

const ESCAPED_MARKER = '\\"portfolios\\":[';
const RAW_MARKER = '"portfolios":[';

export function toPortfolioLabProxyUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${PORTFOLIO_PROXY_PREFIX}${normalized}`;
}

/**
 * Extract the portfolios JSON array from Portfolio Lab HTML using a string-aware
 * bracket matcher (ignores `[` / `]` inside JSON string literals).
 */
export function extractPortfoliosJsonFromHtml(html: string): unknown {
  const escapedStart = html.indexOf(ESCAPED_MARKER);
  const rawStart = html.indexOf(RAW_MARKER);

  let start: number;
  let marker: string;
  let escapedQuotes: boolean;

  if (escapedStart >= 0 && (rawStart < 0 || escapedStart <= rawStart)) {
    start = escapedStart;
    marker = ESCAPED_MARKER;
    escapedQuotes = true;
  } else if (rawStart >= 0) {
    start = rawStart;
    marker = RAW_MARKER;
    escapedQuotes = false;
  } else {
    throw new Error('Portfolio Lab catalog marker was not found in the page HTML.');
  }

  const arrayStart = start + marker.length - 1;
  const arrayEnd = findMatchingArrayEnd(html, arrayStart, escapedQuotes);

  if (arrayEnd < 0) {
    throw new Error('Portfolio Lab catalog parse failed: portfolios array was not closed in the page HTML.');
  }

  let raw = html.slice(arrayStart, arrayEnd);
  if (escapedQuotes) {
    raw = raw.replace(/\\"/g, '"');
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Portfolio Lab catalog JSON parse failed: ${message}`);
  }
}

/**
 * Walk from `arrayStart` (must be `[`) to the index after the matching `]`,
 * ignoring brackets that appear inside JSON strings.
 */
function findMatchingArrayEnd(html: string, arrayStart: number, escapedQuotes: boolean): number {
  if (html[arrayStart] !== '[') {
    return -1;
  }

  let depth = 0;
  let inString = false;
  let index = arrayStart;

  while (index < html.length) {
    if (escapedQuotes) {
      if (html[index] === '\\' && html[index + 1] === '\\') {
        // Escaped backslash inside RSC payload — skip both so \\", etc. stay coherent.
        index += 2;
        continue;
      }

      if (html[index] === '\\' && html[index + 1] === '"') {
        inString = !inString;
        index += 2;
        continue;
      }
    } else {
      if (inString) {
        if (html[index] === '\\') {
          index += 2;
          continue;
        }
        if (html[index] === '"') {
          inString = false;
          index += 1;
          continue;
        }
        index += 1;
        continue;
      }

      if (html[index] === '"') {
        inString = true;
        index += 1;
        continue;
      }
    }

    if (!inString) {
      if (html[index] === '[') {
        depth += 1;
      } else if (html[index] === ']') {
        depth -= 1;
        if (depth === 0) {
          return index + 1;
        }
      }
    }

    index += 1;
  }

  return -1;
}

function catalogFromEntries(
  portfolios: PortfolioLabEntry[],
  diagnostics?: string,
): SourceResult<PortfolioLabCatalog> {
  const catalog: PortfolioLabCatalog = {
    fetchedAt: new Date().toISOString(),
    portfolios,
  };

  return {
    ok: true,
    state: catalog.portfolios.length > 0 ? 'available' : 'no_record',
    data: catalog,
    ...(diagnostics ? { diagnostics } : {}),
  };
}

export async function fetchPortfolioLabCatalog(options?: { force?: boolean }): Promise<SourceResult<PortfolioLabCatalog>> {
  if (!options?.force) {
    const cached = getCached<PortfolioLabCatalog>(PORTFOLIO_CACHE_KEY, PORTFOLIO_CACHE_TTL_MS);

    if (cached) {
      return {
        ok: true,
        state: cached.portfolios.length > 0 ? 'available' : 'no_record',
        data: cached,
        diagnostics: 'Loaded from local cache.',
      };
    }
  }

  let response: Response;

  try {
    response = await fetch(toPortfolioLabProxyUrl('/portfolio'), {
      headers: {
        accept: 'text/html',
      },
    });
  } catch (error) {
    return failureFromUnknown(error instanceof TypeError ? error : new TypeError(String(error)), PORTFOLIO_SOURCE_LABEL);
  }

  if (response.status === 404) {
    const empty: PortfolioLabCatalog = {
      fetchedAt: new Date().toISOString(),
      portfolios: [],
    };
    const result: SourceResult<PortfolioLabCatalog> = {
      ok: true,
      state: 'no_record',
      data: empty,
      diagnostics: 'Portfolio Lab catalog request returned 404.',
    };
    setCached(PORTFOLIO_CACHE_KEY, empty);
    return result;
  }

  if (!response.ok) {
    return failureFromHttpStatus(
      response.status,
      PORTFOLIO_SOURCE_LABEL,
      `Portfolio Lab catalog request failed with ${response.status}`,
    );
  }

  try {
    const html = await response.text();
    const raw = extractPortfoliosJsonFromHtml(html);
    const parsed = parsePortfolioLabEntries(raw);

    if (!parsed.ok) {
      throw new Error(
        `Portfolio Lab catalog parse failure: ${formatPortfolioLabIssues(parsed.issues)}`,
      );
    }

    const diagnostics =
      parsed.quarantinedRecordCount > 0
        ? `Quarantined ${parsed.quarantinedRecordCount} invalid Portfolio Lab record(s): ${formatPortfolioLabIssues(parsed.quarantined)}`
        : undefined;

    const result = catalogFromEntries(parsed.data, diagnostics);

    if (isCacheableSuccess(result)) {
      setCached(PORTFOLIO_CACHE_KEY, result.data);
    }

    return result;
  } catch (error) {
    return failureFromUnknown(error, PORTFOLIO_SOURCE_LABEL);
  }
}

export async function searchPortfolioLabTeams(
  query: string,
): Promise<SourceResult<PortfolioLabSearchHit[]>> {
  let response: Response;

  try {
    response = await fetch(
      toPortfolioLabProxyUrl(`/api/search?q=${encodeURIComponent(query.trim())}`),
      {
        headers: {
          accept: 'application/json',
        },
      },
    );
  } catch (error) {
    return failureFromUnknown(error instanceof TypeError ? error : new TypeError(String(error)), PORTFOLIO_SOURCE_LABEL);
  }

  if (!response.ok) {
    return failureFromHttpStatus(
      response.status,
      PORTFOLIO_SOURCE_LABEL,
      `Portfolio Lab search failed with ${response.status}`,
    );
  }

  try {
    const raw: unknown = await response.json();
    const parsed = parsePortfolioLabSearchHits(raw);

    if (!parsed.ok) {
      throw new Error(`Portfolio Lab search parse failure: ${formatPortfolioLabIssues(parsed.issues)}`);
    }

    return {
      ok: true,
      state: parsed.data.length > 0 ? 'available' : 'no_record',
      data: parsed.data,
    };
  } catch (error) {
    return failureFromUnknown(error, PORTFOLIO_SOURCE_LABEL);
  }
}

export function indexPortfoliosByTeam(portfolios: PortfolioLabEntry[]): Map<number, PortfolioLabEntry[]> {
  const index = new Map<number, PortfolioLabEntry[]>();

  for (const portfolio of portfolios) {
    const existing = index.get(portfolio.teamNumber) ?? [];
    existing.push(portfolio);
    index.set(portfolio.teamNumber, existing);
  }

  for (const [teamNumber, entries] of index) {
    index.set(
      teamNumber,
      [...entries].sort((a, b) => (portfolioSeasonSortValue(b) ?? 0) - (portfolioSeasonSortValue(a) ?? 0)),
    );
  }

  return index;
}

function portfolioSeasonSortValue(entry: PortfolioLabEntry): number | null {
  return portfolioSeasonId(entry);
}

export function portfolioLabAttributionUrl(): string {
  return PORTFOLIO_LAB_CATALOG_URL;
}

export function portfolioLabExternalUrl(path: string): string {
  return path.startsWith('http') ? path : `${PORTFOLIO_LAB_BASE_URL}${path}`;
}

/** Exported for tests — confirms failures do not write the catalog cache key. */
export function portfolioLabCatalogCacheKeyForTests(): string {
  return PORTFOLIO_CACHE_KEY;
}
