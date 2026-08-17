import { SeasonId } from './schema';
import {
  SCOUT_DEFAULT_RANKING_SCOPE,
  SCOUT_META_CATALOG_VERSION,
  ScoutRankingScope,
} from './ftcScoutMeta';

export type ScoutStatValue = {
  value: number;
  rank: number | null;
};

export type ScoutQuickStats = {
  season: number;
  number: number;
  tot: ScoutStatValue;
  auto: ScoutStatValue;
  dc: ScoutStatValue;
  eg: ScoutStatValue;
  /** World ranking pool size for this season (FTCScout `count`). */
  count: number;
};

export type ScoutPointTotals = {
  totalPoints: number | null;
  autoPoints: number | null;
  dcPoints: number | null;
};

export type ScoutEventStats = {
  rank: number | null;
  rp: number | null;
  wins: number;
  losses: number;
  ties: number;
  qualMatchesPlayed: number | null;
  opr: ScoutPointTotals | null;
  avg: {
    totalPoints: number | null;
  } | null;
  /**
   * Points-spread / variability from FTCScout `dev.totalPoints` when present.
   * Not a formal confidence interval.
   */
  scoreSpread: number | null;
};

export type ScoutEventParticipation = {
  season: number;
  eventCode: string;
  teamNumber: number;
  stats: ScoutEventStats | null;
};

export type ScoutTeamProfile = {
  number: number;
  name: string | null;
  schoolName: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  website: string | null;
  rookieYear: number | null;
  updatedAt: string | null;
};

export type TeamScoutData = {
  fetchedAt: string;
  season: SeasonId;
  teamNumber: number;
  rankingScope: ScoutRankingScope;
  metaCatalogVersion: typeof SCOUT_META_CATALOG_VERSION;
  quickStats: ScoutQuickStats | null;
  events: ScoutEventParticipation[];
  /** Identity fields from `GET /rest/v1/teams/{n}`; fail-soft when missing. */
  profile: ScoutTeamProfile | null;
};

export const FTCSCOUT_BASE_URL = 'https://ftcscout.org';
export const FTCSCOUT_API_BASE_URL = 'https://api.ftcscout.org/rest/v1';

export function ftcScoutTeamUrl(teamNumber: number, season?: SeasonId): string {
  const url = new URL(`${FTCSCOUT_BASE_URL}/teams/${teamNumber}`);

  if (season) {
    url.searchParams.set('season', String(season));
  }

  return url.toString();
}

export function ftcScoutEventUrl(season: SeasonId, eventCode: string): string {
  return `${FTCSCOUT_BASE_URL}/events/${season}/${eventCode}`;
}

export function formatScoutNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-';
  }

  return value.toFixed(digits);
}

export function formatScoutRank(rank: number | null | undefined): string {
  if (!rank) {
    return '-';
  }

  return `#${rank.toLocaleString()}`;
}

export function emptyTeamScoutData(
  season: SeasonId,
  teamNumber: number,
  fetchedAt = new Date().toISOString(),
): TeamScoutData {
  return {
    fetchedAt,
    season,
    teamNumber,
    rankingScope: SCOUT_DEFAULT_RANKING_SCOPE,
    metaCatalogVersion: SCOUT_META_CATALOG_VERSION,
    quickStats: null,
    events: [],
    profile: null,
  };
}
