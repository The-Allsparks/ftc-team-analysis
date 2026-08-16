import { SeasonId, isSupportedSeason } from './schema';

const PORTFOLIO_GAME_TO_SEASON: Array<[string, SeasonId]> = [
  ['decode', 2025],
  ['into the deep', 2024],
  ['centerstage', 2023],
  ['power play', 2022],
  ['freight frenzy', 2021],
  ['ultimate goal', 2020],
  ['skystone', 2019],
];

export type PortfolioLabEntry = {
  id: string;
  teamName: string;
  teamNumber: number;
  country: string;
  city?: string;
  season: string;
  level: string;
  stars: string;
  score: string;
  award: string;
  cover?: string;
  pdf: string;
  summary: string;
  awardsBreakdown?: [string, string][];
  criteria?: [string, string][];
  strengths?: string[];
  weaknesses?: string[];
  improvements?: string[];
  benchmarkComparison?: string;
  source?: string;
};

export type PortfolioLabCatalog = {
  fetchedAt: string;
  portfolios: PortfolioLabEntry[];
};

export const PORTFOLIO_LAB_BASE_URL = 'https://www.ftcportfoliolab.org';
export const PORTFOLIO_LAB_CATALOG_URL = `${PORTFOLIO_LAB_BASE_URL}/portfolio`;

export function portfolioSeasonYear(entry: PortfolioLabEntry): number | null {
  const match = entry.season.match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
}

export function portfolioSeasonId(entry: PortfolioLabEntry): SeasonId | null {
  const normalized = entry.season.toLowerCase();

  for (const [game, season] of PORTFOLIO_GAME_TO_SEASON) {
    if (normalized.includes(game)) {
      return season;
    }
  }

  const year = portfolioSeasonYear(entry);
  return year !== null && isSupportedSeason(year) ? year : null;
}

export function portfolioMatchesSeason(entry: PortfolioLabEntry, season: SeasonId): boolean {
  return portfolioSeasonId(entry) === season;
}

export function portfoliosForSeason(portfolios: PortfolioLabEntry[], season: SeasonId): PortfolioLabEntry[] {
  return portfolios.filter((portfolio) => portfolioMatchesSeason(portfolio, season));
}

export function portfolioLabSearchUrl(teamNumber: number): string {
  return `${PORTFOLIO_LAB_CATALOG_URL}?q=${teamNumber}`;
}

export function portfolioCoverUrl(entry: PortfolioLabEntry): string | null {
  if (!entry.cover) {
    return null;
  }

  return entry.cover.startsWith('http') ? entry.cover : `${PORTFOLIO_LAB_BASE_URL}${entry.cover}`;
}
