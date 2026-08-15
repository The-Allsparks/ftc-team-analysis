import {
  FTCSCOUT_API_BASE_URL,
  ScoutEventParticipation,
  ScoutQuickStats,
  TeamScoutData,
} from '../data/ftcScout';
import { SeasonId, TARGET_SEASONS } from '../data/schema';
import { CACHE_TTL, cacheKey, getCached, seasonTtl, setCached } from './ftcCache';
import {
  failureFromUnknown,
  HttpStatusError,
  isCacheableSuccess,
  SourceFailureState,
  SourceResult,
} from './sourceResult';

const FTCSCOUT_PROXY_PREFIX = '/ftcscout-proxy';
const SCOUT_SOURCE_LABEL = 'FTCScout';

export function toFtcScoutProxyUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${FTCSCOUT_PROXY_PREFIX}${normalized}`;
}

function scoutCacheKey(season: SeasonId, teamNumber: number): string {
  return cacheKey('ftcscout-v2', String(season), String(teamNumber));
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
  let response: Response;

  try {
    response = await fetch(toFtcScoutProxyUrl(path), {
      headers: {
        accept: 'application/json',
      },
    });
  } catch (error) {
    throw error instanceof TypeError ? error : new TypeError(String(error));
  }

  if (response.status === 404) {
    throw new ScoutNotFoundError(path);
  }

  if (!response.ok) {
    throw new HttpStatusError(`FTCScout GET ${path} failed with ${response.status}`, response.status);
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`FTCScout GET ${path} returned invalid JSON: ${message}`);
  }
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

type ScoutArmResult<T> =
  | { ok: true; state: 'available' | 'no_record'; data: T | null; diagnostics?: string }
  | { ok: false; state: SourceFailureState; diagnostics: string; userMessage: string };

function settleScoutArm<T>(
  settled: PromiseSettledResult<T>,
  emptyValue: T | null,
): ScoutArmResult<T> {
  if (settled.status === 'fulfilled') {
    return { ok: true, state: 'available', data: settled.value };
  }

  const reason = settled.reason;

  if (reason instanceof ScoutNotFoundError) {
    return { ok: true, state: 'no_record', data: emptyValue };
  }

  const failure = failureFromUnknown(reason, SCOUT_SOURCE_LABEL);
  return {
    ok: false,
    state: failure.state,
    userMessage: failure.userMessage,
    diagnostics: failure.diagnostics,
  };
}

export async function fetchTeamScoutData(
  season: SeasonId,
  teamNumber: number,
  options?: { force?: boolean },
): Promise<SourceResult<TeamScoutData>> {
  const key = scoutCacheKey(season, teamNumber);

  if (!options?.force) {
    const cached = getCached<TeamScoutData>(key, scoutTtl(season));

    if (cached) {
      return {
        ok: true,
        state: cached.quickStats || cached.events.length > 0 ? 'available' : 'no_record',
        data: cached,
        diagnostics: 'Loaded from local cache.',
      };
    }
  }

  const [quickStatsSettled, eventsSettled] = await Promise.allSettled([
    fetchScoutJson<ScoutQuickStats>(`/rest/v1/teams/${teamNumber}/quick-stats?season=${season}`),
    fetchScoutJson<ScoutEventParticipation[]>(`/rest/v1/teams/${teamNumber}/events/${season}`),
  ]);

  const quickArm = settleScoutArm(quickStatsSettled, null);
  const eventsArm = settleScoutArm(eventsSettled, [] as ScoutEventParticipation[]);

  const quickStats =
    quickArm.ok && quickArm.data ? normalizeQuickStats(quickArm.data as ScoutQuickStats) : null;
  const events =
    eventsArm.ok && Array.isArray(eventsArm.data)
      ? eventsArm.data.map(normalizeEventParticipation).sort((a, b) => a.eventCode.localeCompare(b.eventCode))
      : [];

  const data: TeamScoutData = {
    fetchedAt: new Date().toISOString(),
    season,
    teamNumber,
    quickStats,
    events,
  };

  const hardFailures = [quickArm, eventsArm].filter((arm) => !arm.ok);

  if (hardFailures.length > 0) {
    const primary = hardFailures[0]!;
    const diagnostics = [quickArm.ok ? null : quickArm.diagnostics, eventsArm.ok ? null : eventsArm.diagnostics]
      .filter(Boolean)
      .join(' | ');

    return {
      ok: false,
      state: primary.state,
      data,
      userMessage: primary.userMessage,
      diagnostics,
    };
  }

  const state = data.quickStats || data.events.length > 0 ? 'available' : 'no_record';
  const result: SourceResult<TeamScoutData> = {
    ok: true,
    state,
    data,
  };

  if (isCacheableSuccess(result)) {
    setCached(key, data);
  }

  return result;
}

export function scoutApiDocsUrl(): string {
  return `${FTCSCOUT_API_BASE_URL.replace('/rest/v1', '')}/api`;
}

/** Test helper: current scout cache key namespace (v2 avoids pre-fix empty successes). */
export function scoutTeamCacheKeyForTests(season: SeasonId, teamNumber: number): string {
  return scoutCacheKey(season, teamNumber);
}
