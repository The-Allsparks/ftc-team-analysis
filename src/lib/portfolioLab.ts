import {
  PORTFOLIO_LAB_BASE_URL,
  PORTFOLIO_LAB_CATALOG_URL,
  PortfolioLabCatalog,
  PortfolioLabEntry,
  portfolioSeasonId,
} from '../data/portfolioLab';
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

export function toPortfolioLabProxyUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${PORTFOLIO_PROXY_PREFIX}${normalized}`;
}

function extractPortfoliosFromHtml(html: string): PortfolioLabEntry[] {
  const marker = html.includes('\\"portfolios\\":[') ? '\\"portfolios\\":[' : '"portfolios":[';
  const start = html.indexOf(marker);

  if (start < 0) {
    throw new Error('Portfolio Lab catalog marker was not found in the page HTML.');
  }

  let index = start + marker.length - 1;
  let depth = 0;

  for (; index < html.length; index += 1) {
    const character = html[index];

    if (character === '[') {
      depth += 1;
    } else if (character === ']') {
      depth -= 1;

      if (depth === 0) {
        index += 1;
        break;
      }
    }
  }

  const raw = html.slice(start + marker.length - 1, index).replace(/\\"/g, '"');
  return JSON.parse(raw) as PortfolioLabEntry[];
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
    const catalog: PortfolioLabCatalog = {
      fetchedAt: new Date().toISOString(),
      portfolios: extractPortfoliosFromHtml(html),
    };

    const result: SourceResult<PortfolioLabCatalog> = {
      ok: true,
      state: catalog.portfolios.length > 0 ? 'available' : 'no_record',
      data: catalog,
    };

    if (isCacheableSuccess(result)) {
      setCached(PORTFOLIO_CACHE_KEY, catalog);
    }

    return result;
  } catch (error) {
    return failureFromUnknown(error, PORTFOLIO_SOURCE_LABEL);
  }
}

export async function searchPortfolioLabTeams(query: string): Promise<
  SourceResult<
    Array<{
      id: string;
      teamName: string;
      teamNumber: number;
      country: string;
    }>
  >
> {
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
    const data = (await response.json()) as Array<{
      id: string;
      teamName: string;
      teamNumber: number;
      country: string;
    }>;

    return {
      ok: true,
      state: data.length > 0 ? 'available' : 'no_record',
      data,
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
