import {
  FTCSCOUT_API_BASE_URL,
  ScoutEventParticipation,
  ScoutQuickStats,
  TeamScoutData,
} from '../data/ftcScout';
import { SeasonId, TARGET_SEASONS } from '../data/schema';
import { CACHE_TTL, cacheKey, getCached, seasonTtl, setCached } from './ftcCache';

const FTCSCOUT_PROXY_PREFIX = '/ftcscout-proxy';

export function toFtcScoutProxyUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${FTCSCOUT_PROXY_PREFIX}${normalized}`;
}

function scoutCacheKey(season: SeasonId, teamNumber: number): string {
  return cacheKey('ftcscout', String(season), String(teamNumber));
}

function scoutTtl(season: SeasonId): number {
  return seasonTtl(
    season,
    TARGET_SEASONS[0],
    CACHE_TTL.currentSeasonTeamMs,
    CACHE_TTL.olderSeasonTeamMs,
  );
}

async function fetchScoutJson<T>(path: string): Promise<T> {
  const response = await fetch(toFtcScoutProxyUrl(path), {
    headers: {
      accept: 'application/json',
    },
  });

  if (response.status === 404) {
    throw new ScoutNotFoundError(path);
  }

  if (!response.ok) {
    throw new Error(`FTCScout GET ${path} failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export class ScoutNotFoundError extends Error {
  constructor(path: string) {
    super(`FTCScout resource not found: ${path}`);
    this.name = 'ScoutNotFoundError';
  }
}

function normalizeQuickStats(payload: ScoutQuickStats): ScoutQuickStats {
  return {
    ...payload,
    tot: {
      value: payload.tot.value,
      rank: payload.tot.rank ?? null,
    },
    auto: {
      value: payload.auto.value,
      rank: payload.auto.rank ?? null,
    },
    dc: {
      value: payload.dc.value,
      rank: payload.dc.rank ?? null,
    },
    eg: {
      value: payload.eg.value,
      rank: payload.eg.rank ?? null,
    },
  };
}

function normalizeEventParticipation(payload: ScoutEventParticipation): ScoutEventParticipation {
  if (!payload.stats) {
    return payload;
  }

  return {
    ...payload,
    stats: {
      rank: payload.stats.rank ?? null,
      rp: payload.stats.rp ?? null,
      wins: payload.stats.wins ?? 0,
      losses: payload.stats.losses ?? 0,
      ties: payload.stats.ties ?? 0,
      qualMatchesPlayed: payload.stats.qualMatchesPlayed ?? null,
      opr: payload.stats.opr
        ? {
            totalPoints: payload.stats.opr.totalPoints ?? null,
            autoPoints: payload.stats.opr.autoPoints ?? null,
            dcPoints: payload.stats.opr.dcPoints ?? null,
          }
        : null,
      avg: payload.stats.avg
        ? {
            totalPoints: payload.stats.avg.totalPoints ?? null,
          }
        : null,
    },
  };
}

export async function fetchTeamScoutData(
  season: SeasonId,
  teamNumber: number,
  options?: { force?: boolean },
): Promise<TeamScoutData> {
  const key = scoutCacheKey(season, teamNumber);

  if (!options?.force) {
    const cached = getCached<TeamScoutData>(key, scoutTtl(season));

    if (cached) {
      return cached;
    }
  }

  const [quickStatsResult, eventsResult] = await Promise.allSettled([
    fetchScoutJson<ScoutQuickStats>(`/rest/v1/teams/${teamNumber}/quick-stats?season=${season}`),
    fetchScoutJson<ScoutEventParticipation[]>(`/rest/v1/teams/${teamNumber}/events/${season}`),
  ]);

  const quickStats =
    quickStatsResult.status === 'fulfilled' ? normalizeQuickStats(quickStatsResult.value) : null;

  const events =
    eventsResult.status === 'fulfilled'
      ? eventsResult.value.map(normalizeEventParticipation).sort((a, b) => a.eventCode.localeCompare(b.eventCode))
      : [];

  const data: TeamScoutData = {
    fetchedAt: new Date().toISOString(),
    season,
    teamNumber,
    quickStats,
    events,
  };

  setCached(key, data);
  return data;
}

export function scoutApiDocsUrl(): string {
  return `${FTCSCOUT_API_BASE_URL.replace('/rest/v1', '')}/api`;
}
