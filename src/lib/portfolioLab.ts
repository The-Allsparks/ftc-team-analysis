import {
  PORTFOLIO_LAB_BASE_URL,
  PORTFOLIO_LAB_CATALOG_URL,
  PortfolioLabCatalog,
  PortfolioLabEntry,
  portfolioSeasonId,
} from '../data/portfolioLab';
import { cacheKey, getCached, setCached } from './ftcCache';

const PORTFOLIO_CACHE_KEY = cacheKey('portfolio-lab', 'catalog');
const PORTFOLIO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PORTFOLIO_PROXY_PREFIX = '/portfolio-lab-proxy';

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

export async function fetchPortfolioLabCatalog(options?: { force?: boolean }): Promise<PortfolioLabCatalog> {
  if (!options?.force) {
    const cached = getCached<PortfolioLabCatalog>(PORTFOLIO_CACHE_KEY, PORTFOLIO_CACHE_TTL_MS);

    if (cached) {
      return cached;
    }
  }

  const response = await fetch(toPortfolioLabProxyUrl('/portfolio'), {
    headers: {
      accept: 'text/html',
    },
  });

  if (!response.ok) {
    throw new Error(`Portfolio Lab catalog request failed with ${response.status}`);
  }

  const html = await response.text();
  const catalog: PortfolioLabCatalog = {
    fetchedAt: new Date().toISOString(),
    portfolios: extractPortfoliosFromHtml(html),
  };

  setCached(PORTFOLIO_CACHE_KEY, catalog);
  return catalog;
}

export async function searchPortfolioLabTeams(query: string): Promise<
  Array<{
    id: string;
    teamName: string;
    teamNumber: number;
    country: string;
  }>
> {
  const response = await fetch(
    toPortfolioLabProxyUrl(`/api/search?q=${encodeURIComponent(query.trim())}`),
    {
      headers: {
        accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Portfolio Lab search failed with ${response.status}`);
  }

  return response.json();
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
