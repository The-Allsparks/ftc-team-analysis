import type {
  RecordSummary,
  Team,
  TeamAward,
  TeamEvent,
  TeamSeason,
} from '../data/schema';
import {
  failureFromHttpStatus,
  failureFromUnknown,
  HttpStatusError,
  type SourceFailure,
  type SourceResult,
  userMessageFor,
} from './sourceResult';

/** Official FTC Events API host (HTTPS). Do not use the HTML site host for API calls. */
export const FIRST_API_BASE_URL = 'https://ftc-api.firstinspires.org';
export const FIRST_API_VERSION_PREFIX = '/v2.0';
export const FIRST_API_SOURCE = 'FTC Events API (authenticated)';
export const FIRST_API_INFO_URL = 'https://ftc-events.firstinspires.org/services/API';
export const FIRST_API_DOCS_URL = 'https://ftc-events.firstinspires.org/api-docs/index.html';
export const FIRST_API_USER_AGENT = 'Nevada-FTC-Team-Explorer-first-api';

/** Server-side env var names (never `VITE_*`; never commit values). */
export const FIRST_API_USERNAME_ENV = 'FIRST_API_USERNAME';
export const FIRST_API_TOKEN_ENV = 'FIRST_API_TOKEN';

/** Default pause between live API calls (rate-limit courtesy). */
export const FIRST_API_DEFAULT_DELAY_MS = 200;

/**
 * Relative paths under `/v2.0/` that this client may GET.
 * Keep this list tight — competitive listings + results only.
 */
export const FIRST_API_ALLOWED_PATH_PATTERNS: readonly RegExp[] = [
  /^\/\d{4}$/,
  /^\/\d{4}\/teams$/,
  /^\/\d{4}\/events$/,
  /^\/\d{4}\/awards\/list$/,
  /^\/\d{4}\/awards\/\d{1,5}$/,
  /^\/\d{4}\/awards\/[A-Za-z0-9_-]+$/,
  /^\/\d{4}\/awards\/[A-Za-z0-9_-]+\/\d{1,5}$/,
  /^\/\d{4}\/matches\/[A-Za-z0-9_-]+$/,
  /^\/\d{4}\/rankings\/[A-Za-z0-9_-]+$/,
  /^\/\d{4}\/schedule\/[A-Za-z0-9_-]+$/,
  /^\/\d{4}\/schedule\/[A-Za-z0-9_-]+\/[A-Za-z]+\/hybrid$/,
  /^\/\d{4}\/leagues$/,
  /^\/\d{4}\/leagues\/members\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/,
  /^\/\d{4}\/leagues\/rankings\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/,
];

export type FirstApiCredentials = {
  username: string;
  token: string;
};

export type FirstApiTeam = {
  teamNumber: number;
  displayTeamNumber?: string | null;
  nameShort?: string | null;
  nameFull?: string | null;
  schoolName?: string | null;
  city?: string | null;
  stateProv?: string | null;
  country?: string | null;
  website?: string | null;
  rookieYear?: number | null;
  robotName?: string | null;
  homeRegion?: string | null;
  displayLocation?: string | null;
};

export type FirstApiTeamsPage = {
  teams?: FirstApiTeam[] | null;
  teamCountTotal?: number;
  teamCountPage?: number;
  pageCurrent?: number;
  pageTotal?: number;
};

export type FirstApiAward = {
  awardId?: number;
  teamNumber?: number | null;
  eventCode?: string | null;
  name?: string | null;
  series?: number | null;
  schoolName?: string | null;
  fullTeamName?: string | null;
};

export type FirstApiAwardsResponse = {
  awards?: FirstApiAward[] | null;
};

export type FirstApiRanking = {
  rank: number;
  teamNumber: number;
  displayTeamNumber?: string | null;
  teamName?: string | null;
  sortOrder1?: number;
  wins?: number;
  losses?: number;
  ties?: number;
  qualAverage?: number;
  matchesPlayed?: number;
  matchesCounted?: number;
};

export type FirstApiRankingsResponse = {
  rankings?: FirstApiRanking[] | null;
};

export type FirstApiEvent = {
  code?: string | null;
  name?: string | null;
  regionCode?: string | null;
  leagueCode?: string | null;
  city?: string | null;
  stateprov?: string | null;
  country?: string | null;
  dateStart?: string | null;
  dateEnd?: string | null;
  typeName?: string | null;
};

export type FirstApiEventsResponse = {
  events?: FirstApiEvent[] | null;
  eventCount?: number;
};

export type ApplyFirstApiEnrichmentResult = {
  seasonsTouched: number;
  awardsReplaced: number;
  eventsRankUpdated: number;
  recordsUpdated: number;
  apiCalls: number;
  /** Present when credentials missing or a request failed (fail-soft). */
  result: SourceResult<{ enrichedTeams: number }>;
};

export type FirstApiFetchOptions = {
  credentials?: FirstApiCredentials | null;
  fetchImpl?: typeof fetch;
  delayMs?: number;
  /** Injected sleep for tests. */
  sleep?: (ms: number) => Promise<void>;
};

type CacheEntry = {
  storedAt: number;
  value: unknown;
};

/** In-memory GET cache for a single pull run (keyed by path + query). */
export class FirstApiResponseCache {
  private readonly store = new Map<string, CacheEntry>();

  constructor(private readonly ttlMs: number = 60 * 60 * 1000) {}

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }
    if (Date.now() - entry.storedAt > this.ttlMs) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set(key: string, value: unknown): void {
    this.store.set(key, { storedAt: Date.now(), value });
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

/**
 * Read optional server-side FIRST API credentials.
 * Never log username/token values. Pass `process.env` from Node pull scripts only.
 */
export function readFirstApiCredentials(
  env: Record<string, string | undefined> = {},
): FirstApiCredentials | null {
  const username = env[FIRST_API_USERNAME_ENV]?.trim() ?? '';
  const token = env[FIRST_API_TOKEN_ENV]?.trim() ?? '';
  if (!username || !token) {
    return null;
  }
  return { username, token };
}

export function missingFirstApiCredentialsFailure(): SourceFailure {
  return {
    ok: false,
    state: 'auth_failure',
    userMessage: userMessageFor('auth_failure', FIRST_API_SOURCE),
    diagnostics: `credentials_absent: set ${FIRST_API_USERNAME_ENV} and ${FIRST_API_TOKEN_ENV} server-side only (never VITE_* / never commit)`,
  };
}

/** Normalize a path under `/v2.0` (leading slash, no host, no `..`). */
export function normalizeFirstApiPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    throw new Error('FIRST API path must be non-empty');
  }
  if (/^https?:\/\//i.test(trimmed)) {
    throw new Error('FIRST API path must be relative under /v2.0 (no absolute URL)');
  }
  let relative = trimmed.startsWith(FIRST_API_VERSION_PREFIX)
    ? trimmed.slice(FIRST_API_VERSION_PREFIX.length)
    : trimmed;
  if (!relative.startsWith('/')) {
    relative = `/${relative}`;
  }
  if (relative.includes('..') || relative.includes('\\')) {
    throw new Error(`FIRST API path rejected: ${path}`);
  }
  // Drop query/hash before allowlist check; callers pass query separately.
  const q = relative.indexOf('?');
  const h = relative.indexOf('#');
  let end = relative.length;
  if (q >= 0) end = Math.min(end, q);
  if (h >= 0) end = Math.min(end, h);
  return relative.slice(0, end);
}

export function isAllowedFirstApiPath(path: string): boolean {
  const normalized = normalizeFirstApiPath(path);
  return FIRST_API_ALLOWED_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function buildFirstApiUrl(
  path: string,
  query?: Record<string, string | number | boolean | undefined | null>,
): URL {
  const normalized = normalizeFirstApiPath(path);
  if (!isAllowedFirstApiPath(normalized)) {
    throw new Error(`FIRST API path not allowlisted: ${normalized}`);
  }
  const url = new URL(`${FIRST_API_BASE_URL}${FIRST_API_VERSION_PREFIX}${normalized}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

export function buildBasicAuthHeader(credentials: FirstApiCredentials): string {
  const raw = `${credentials.username}:${credentials.token}`;
  const encoded =
    typeof btoa === 'function'
      ? btoa(raw)
      : Buffer.from(raw, 'utf8').toString('base64');
  return `Basic ${encoded}`;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Low-level allowlisted GET. Returns SourceResult; never throws for HTTP/network failures.
 * Does **not** call the network when credentials are absent.
 */
export async function fetchFirstApiJson<T>(
  path: string,
  options: FirstApiFetchOptions & {
    query?: Record<string, string | number | boolean | undefined | null>;
    cache?: FirstApiResponseCache;
  } = {},
): Promise<SourceResult<T>> {
  const credentials = options.credentials ?? null;
  if (!credentials) {
    return missingFirstApiCredentialsFailure();
  }

  let url: URL;
  try {
    url = buildFirstApiUrl(path, options.query);
  } catch (error) {
    return {
      ok: false,
      state: 'proxy_failure',
      userMessage: userMessageFor('proxy_failure', FIRST_API_SOURCE),
      diagnostics: error instanceof Error ? error.message : String(error),
    };
  }

  const cacheKey = url.toString();
  if (options.cache) {
    const cached = options.cache.get<T>(cacheKey);
    if (cached !== undefined) {
      return { ok: true, state: 'available', data: cached, diagnostics: 'cache_hit' };
    }
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const delayMs = options.delayMs ?? FIRST_API_DEFAULT_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;

  try {
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    const response = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: buildBasicAuthHeader(credentials),
        'User-Agent': FIRST_API_USER_AGENT,
      },
    });

    if (!response.ok) {
      const bodySnippet = (await response.text().catch(() => '')).slice(0, 200);
      const failure = failureFromHttpStatus(
        response.status,
        FIRST_API_SOURCE,
        `HTTP ${response.status} for ${url.pathname}${url.search}${bodySnippet ? `; body=${bodySnippet}` : ''}`,
      );
      return failure;
    }

    let data: T;
    try {
      data = (await response.json()) as T;
    } catch (error) {
      return {
        ok: false,
        state: 'parse_failure',
        userMessage: userMessageFor('parse_failure', FIRST_API_SOURCE),
        diagnostics: error instanceof Error ? error.message : String(error),
      };
    }

    options.cache?.set(cacheKey, data);
    return { ok: true, state: 'available', data };
  } catch (error) {
    if (error instanceof HttpStatusError) {
      return failureFromHttpStatus(error.status, FIRST_API_SOURCE, error.message);
    }
    return failureFromUnknown(error, FIRST_API_SOURCE);
  }
}

/** Fetch all pages of `GET /{season}/teams`. */
export async function fetchAllFirstApiTeams(
  season: number,
  options: FirstApiFetchOptions & {
    query?: Record<string, string | number | boolean | undefined | null>;
    cache?: FirstApiResponseCache;
  } = {},
): Promise<SourceResult<FirstApiTeam[]>> {
  if (!options.credentials) {
    return missingFirstApiCredentialsFailure();
  }

  const teams: FirstApiTeam[] = [];
  let page = 1;
  let pageTotal = 1;

  while (page <= pageTotal) {
    const pageResult = await fetchFirstApiJson<FirstApiTeamsPage>(`/${season}/teams`, {
      ...options,
      query: { ...options.query, page },
    });
    if (!pageResult.ok) {
      return pageResult;
    }

    const batch = pageResult.data.teams ?? [];
    teams.push(...batch);
    pageTotal = Math.max(1, pageResult.data.pageTotal ?? 1);
    page += 1;

    if (batch.length === 0 && page <= pageTotal) {
      break;
    }
  }

  return { ok: true, state: 'available', data: teams };
}

export function mapFirstApiAwardToTeamAward(
  award: FirstApiAward,
  eventNameFallback?: string | null,
): TeamAward | null {
  const name = award.name?.trim();
  if (!name) {
    return null;
  }
  const eventCode = award.eventCode?.trim() || null;
  const eventName =
    eventNameFallback?.trim() ||
    (eventCode ? `Event ${eventCode}` : 'Unknown event');

  return {
    name,
    awardType: name,
    eventName,
    eventCode,
    awardUrl: null,
    eventUrl: eventCode
      ? `https://ftc-events.firstinspires.org/event/${eventCode}`
      : null,
  };
}

export function recordSummaryFromRanking(ranking: FirstApiRanking): RecordSummary {
  const wins = ranking.wins ?? 0;
  const losses = ranking.losses ?? 0;
  const ties = ranking.ties ?? 0;
  return {
    wins,
    losses,
    ties,
    text: `${wins}-${losses}-${ties}`,
  };
}

/**
 * Conflict rules (#17): when API competitive facts are present, they win over
 * public-page scrape values. HTML remains when the API omits that field.
 */
export function mergeFirstApiAwardsIntoSeason(
  season: TeamSeason,
  apiAwards: FirstApiAward[],
  eventNameByCode: Map<string, string> = new Map(),
): { season: TeamSeason; replaced: boolean } {
  const mapped = apiAwards
    .map((award) =>
      mapFirstApiAwardToTeamAward(
        award,
        award.eventCode ? eventNameByCode.get(award.eventCode) ?? null : null,
      ),
    )
    .filter((row): row is TeamAward => row !== null);

  if (mapped.length === 0) {
    return { season, replaced: false };
  }

  return {
    season: { ...season, awards: mapped },
    replaced: true,
  };
}

export function mergeFirstApiRankingIntoSeason(
  season: TeamSeason,
  eventCode: string,
  ranking: FirstApiRanking,
  eventMeta?: { name?: string | null; location?: string | null },
): { season: TeamSeason; rankUpdated: boolean; recordUpdated: boolean } {
  const code = eventCode.trim().toUpperCase();
  let rankUpdated = false;
  let recordUpdated = false;

  const events = season.events.map((event) => {
    const eventKey = (event.code ?? '').trim().toUpperCase();
    if (eventKey !== code) {
      return event;
    }
    rankUpdated = true;
    const next: TeamEvent = {
      ...event,
      rank: String(ranking.rank),
      rankingScore:
        typeof ranking.sortOrder1 === 'number' ? ranking.sortOrder1 : event.rankingScore,
      matchCount:
        typeof ranking.matchesPlayed === 'number' ? ranking.matchesPlayed : event.matchCount,
      name: eventMeta?.name?.trim() || event.name,
      location: eventMeta?.location?.trim() || event.location,
    };
    return next;
  });

  let nextSeason: TeamSeason = { ...season, events };

  if (!events.some((event) => (event.code ?? '').trim().toUpperCase() === code)) {
    rankUpdated = true;
    nextSeason = {
      ...nextSeason,
      events: [
        ...events,
        {
          code: eventCode,
          name: eventMeta?.name?.trim() || `Event ${eventCode}`,
          dateRange: null,
          eventOrder: null,
          location: eventMeta?.location ?? null,
          league: null,
          rank: String(ranking.rank),
          totalPoints: null,
          matchCount: ranking.matchesPlayed ?? 0,
          rankingScore: ranking.sortOrder1 ?? null,
          leagueSeasonRank: null,
          leagueSeasonRankTotal: null,
          qualificationUrl: null,
          playoffUrl: null,
          playoffRecord: null,
          allianceSelection: null,
          sourceUrl: `https://ftc-events.firstinspires.org/event/${eventCode}`,
        },
      ],
    };
  }

  if (
    typeof ranking.wins === 'number' ||
    typeof ranking.losses === 'number' ||
    typeof ranking.ties === 'number'
  ) {
    nextSeason = {
      ...nextSeason,
      qualificationRecord: recordSummaryFromRanking(ranking),
    };
    recordUpdated = true;
  }

  return { season: nextSeason, rankUpdated, recordUpdated };
}

/**
 * Opt-in enrichment: for each team season, prefer FIRST API awards + event rankings
 * when credentials are present. Fail-soft when credentials are missing or requests fail.
 */
export async function applyFirstApiCompetitiveEnrichment(
  teams: Team[],
  options: FirstApiFetchOptions & {
    seasons?: number[];
    cache?: FirstApiResponseCache;
  } = {},
): Promise<ApplyFirstApiEnrichmentResult> {
  const credentials = options.credentials ?? null;
  const empty: ApplyFirstApiEnrichmentResult = {
    seasonsTouched: 0,
    awardsReplaced: 0,
    eventsRankUpdated: 0,
    recordsUpdated: 0,
    apiCalls: 0,
    result: missingFirstApiCredentialsFailure(),
  };

  if (!credentials) {
    return empty;
  }

  const cache = options.cache ?? new FirstApiResponseCache();
  const fetchOpts: FirstApiFetchOptions & { cache: FirstApiResponseCache } = {
    ...options,
    credentials,
    cache,
  };

  let seasonsTouched = 0;
  let awardsReplaced = 0;
  let eventsRankUpdated = 0;
  let recordsUpdated = 0;
  let apiCalls = 0;
  let enrichedTeams = 0;
  let lastFailure: SourceFailure | null = null;

  const seasonFilter = options.seasons ? new Set(options.seasons) : null;

  for (const team of teams) {
    let teamChanged = false;

    for (const [seasonKey, season] of Object.entries(team.seasons)) {
      if (!season) continue;
      const seasonYear = Number(seasonKey);
      if (!Number.isFinite(seasonYear)) continue;
      if (seasonFilter && !seasonFilter.has(seasonYear)) continue;

      seasonsTouched += 1;

      const awardsResult = await fetchFirstApiJson<FirstApiAwardsResponse>(
        `/${seasonYear}/awards/${team.number}`,
        fetchOpts,
      );
      apiCalls += 1;
      if (!awardsResult.ok) {
        lastFailure = awardsResult;
        if (awardsResult.state === 'auth_failure' || awardsResult.state === 'rate_limited') {
          return {
            seasonsTouched,
            awardsReplaced,
            eventsRankUpdated,
            recordsUpdated,
            apiCalls,
            result: awardsResult,
          };
        }
        continue;
      }

      const eventNameByCode = new Map<string, string>();
      for (const event of season.events) {
        if (event.code) {
          eventNameByCode.set(event.code, event.name);
        }
      }

      const awardsMerge = mergeFirstApiAwardsIntoSeason(
        season,
        awardsResult.data.awards ?? [],
        eventNameByCode,
      );
      let nextSeason = awardsMerge.season;
      if (awardsMerge.replaced) {
        awardsReplaced += 1;
        teamChanged = true;
      }

      const eventCodes = [
        ...new Set(
          nextSeason.events
            .map((event) => event.code?.trim())
            .filter((code): code is string => Boolean(code)),
        ),
      ];

      for (const eventCode of eventCodes) {
        const rankingsResult = await fetchFirstApiJson<FirstApiRankingsResponse>(
          `/${seasonYear}/rankings/${eventCode}`,
          fetchOpts,
        );
        apiCalls += 1;
        if (!rankingsResult.ok) {
          lastFailure = rankingsResult;
          if (rankingsResult.state === 'auth_failure' || rankingsResult.state === 'rate_limited') {
            team.seasons[seasonKey as keyof typeof team.seasons] = nextSeason;
            return {
              seasonsTouched,
              awardsReplaced,
              eventsRankUpdated,
              recordsUpdated,
              apiCalls,
              result: rankingsResult,
            };
          }
          continue;
        }

        const ranking = (rankingsResult.data.rankings ?? []).find(
          (row) => row.teamNumber === team.number,
        );
        if (!ranking) {
          continue;
        }

        const existing = nextSeason.events.find(
          (event) => (event.code ?? '').trim().toUpperCase() === eventCode.toUpperCase(),
        );
        const rankingMerge = mergeFirstApiRankingIntoSeason(nextSeason, eventCode, ranking, {
          name: existing?.name,
          location: existing?.location,
        });
        nextSeason = rankingMerge.season;
        if (rankingMerge.rankUpdated) {
          eventsRankUpdated += 1;
          teamChanged = true;
        }
        if (rankingMerge.recordUpdated) {
          recordsUpdated += 1;
          teamChanged = true;
        }
      }

      team.seasons[seasonKey as keyof typeof team.seasons] = nextSeason;
    }

    if (teamChanged) {
      enrichedTeams += 1;
    }
  }

  if (lastFailure && enrichedTeams === 0) {
    return {
      seasonsTouched,
      awardsReplaced,
      eventsRankUpdated,
      recordsUpdated,
      apiCalls,
      result: lastFailure,
    };
  }

  return {
    seasonsTouched,
    awardsReplaced,
    eventsRankUpdated,
    recordsUpdated,
    apiCalls,
    result: {
      ok: true,
      state: 'available',
      data: { enrichedTeams },
      diagnostics: lastFailure
        ? `partial; lastFailure=${lastFailure.state}:${lastFailure.diagnostics}`
        : undefined,
    },
  };
}
