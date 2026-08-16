import type {
  LinkConfirmation,
  LinkOwnershipConfidence,
  Team,
  TeamLink,
  TeamVideoResource,
  VideoResourceEvidenceKind,
  VideoResourceKind,
} from '../data/schema';
import { isGm0LinkSource } from './gm0Gallery';
import { teamNameTokens } from './githubRepos';
import { isAllowedPublicTeamLink, normalizeLinkUrl } from './linkDiscovery';
import { isOpenAllianceLinkSource } from './openAlliance';
import {
  failureFromHttpStatus,
  type SourceResult,
  userMessageFor,
} from './sourceResult';

/** YouTube Data API v3 (requires server-side `YOUTUBE_API_KEY`; never commit keys). */
export const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
export const YOUTUBE_SOURCE = 'YouTube (verified)';
export const YOUTUBE_USER_AGENT = 'Nevada-FTC-Team-Explorer-youtube-verification';

/** Documented default free-tier daily units (operator reference; not enforced client-side). */
export const YOUTUBE_DEFAULT_DAILY_QUOTA_UNITS = 10_000;
export const YOUTUBE_QUOTA_COST = {
  search: 100,
  channels: 1,
  videos: 1,
  playlists: 1,
} as const;

export type { VideoResourceEvidenceKind, VideoResourceKind };

export type ParsedYoutubeResource = {
  url: string;
  kind: VideoResourceKind;
  channelId: string | null;
  handle: string | null;
  videoId: string | null;
  playlistId: string | null;
};

export type YoutubeSearchHit = {
  url: string;
  kind: VideoResourceKind;
  title?: string | null;
  description?: string | null;
  channelTitle?: string | null;
  publishedAt?: string | null;
  channelId?: string | null;
  videoId?: string | null;
  playlistId?: string | null;
  /** True when the only identity signal is the team number in title/description. */
  matchedOnNumberOnly?: boolean;
};

export type YoutubeCandidate = {
  url: string;
  kind: VideoResourceKind;
  channelId: string | null;
  handle: string | null;
  videoId: string | null;
  playlistId: string | null;
  evidenceKind: VideoResourceEvidenceKind;
  source: string;
  evidence: string;
  ownershipConfidence: LinkOwnershipConfidence;
  titleHint?: string | null;
  publishedAtHint?: string | null;
  descriptionHint?: string | null;
};

export type YoutubeResourceMetadata = {
  title: string | null;
  publishedAt: string | null;
  description: string | null;
  channelId: string | null;
};

export type ApplyYoutubeEnrichmentResult = {
  matchedTeams: number;
  resourcesAdded: number;
  candidatesSeen: number;
  rejectedNameOnly: number;
  skippedInvalid: number;
  apiCalls: number;
  cacheHits: number;
  /** Present when Data API quota/auth failed mid-run (fail-soft). */
  apiFailure?: SourceResult<unknown>;
};

type CacheEntry = {
  storedAt: number;
  value: unknown;
};

/**
 * In-memory response cache for YouTube Data API calls.
 * Prefer reusing declared-link verification over burning search quota.
 */
export class YoutubeResponseCache {
  private readonly store = new Map<string, CacheEntry>();

  constructor(private readonly ttlMs: number = 24 * 60 * 60 * 1000) {}

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

/** Read optional server-side API key. Never log the value. Pass `process.env` from Node pull scripts. */
export function readYoutubeApiKey(env: Record<string, string | undefined> = {}): string | null {
  const key = env.YOUTUBE_API_KEY?.trim();
  return key ? key : null;
}

/**
 * Parse a public YouTube channel / video / playlist URL.
 * Does not infer ownership — callers must supply evidence separately.
 */
export function parseYoutubeUrl(value: string | null | undefined): ParsedYoutubeResource | null {
  const normalized = normalizeLinkUrl(value);
  if (!normalized) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'youtu.be') {
    return null;
  }

  if (host === 'youtu.be') {
    const videoId = parsed.pathname.split('/').filter(Boolean)[0] ?? null;
    if (!videoId || !/^[A-Za-z0-9_-]{6,}$/.test(videoId)) {
      return null;
    }
    return {
      url: `https://www.youtube.com/watch?v=${videoId}`,
      kind: 'video',
      channelId: null,
      handle: null,
      videoId,
      playlistId: null,
    };
  }

  const parts = parsed.pathname.split('/').filter(Boolean);
  const first = parts[0]?.toLowerCase() ?? '';

  if (first === 'channel' && parts[1]) {
    const channelId = parts[1];
    return {
      url: `https://www.youtube.com/channel/${channelId}`,
      kind: 'channel',
      channelId,
      handle: null,
      videoId: null,
      playlistId: null,
    };
  }

  if (first.startsWith('@') && first.length > 1) {
    const handle = first;
    return {
      url: `https://www.youtube.com/${handle}`,
      kind: 'channel',
      channelId: null,
      handle,
      videoId: null,
      playlistId: null,
    };
  }

  if ((first === 'c' || first === 'user') && parts[1]) {
    const handle = parts[1];
    return {
      url: `https://www.youtube.com/${first}/${handle}`,
      kind: 'channel',
      channelId: null,
      handle,
      videoId: null,
      playlistId: null,
    };
  }

  if (first === 'watch') {
    const videoId = parsed.searchParams.get('v');
    if (!videoId) {
      return null;
    }
    const playlistId = parsed.searchParams.get('list');
    return {
      url: playlistId
        ? `https://www.youtube.com/watch?v=${videoId}&list=${playlistId}`
        : `https://www.youtube.com/watch?v=${videoId}`,
      kind: 'video',
      channelId: null,
      handle: null,
      videoId,
      playlistId,
    };
  }

  if (first === 'shorts' && parts[1]) {
    const videoId = parts[1];
    return {
      url: `https://www.youtube.com/shorts/${videoId}`,
      kind: 'video',
      channelId: null,
      handle: null,
      videoId,
      playlistId: null,
    };
  }

  if (first === 'playlist') {
    const playlistId = parsed.searchParams.get('list');
    if (!playlistId) {
      return null;
    }
    return {
      url: `https://www.youtube.com/playlist?list=${playlistId}`,
      kind: 'playlist',
      channelId: null,
      handle: null,
      videoId: null,
      playlistId,
    };
  }

  return null;
}

export function isYoutubeVideoLink(link: Pick<TeamLink, 'type' | 'url'>): boolean {
  return Boolean(parseYoutubeUrl(link.url));
}

export function isYoutubeVerifiedSource(source: string | null | undefined): boolean {
  return Boolean(source && /youtube\s*\(verified\)/i.test(source));
}

export function youtubeResourceAttribution(
  resource: Pick<TeamVideoResource, 'source' | 'evidence' | 'ownershipConfidence'>,
): string {
  const parts = [
    resource.source,
    resource.ownershipConfidence ? `ownership: ${resource.ownershipConfidence}` : null,
    resource.evidence,
  ].filter(Boolean);
  return parts.join(' · ');
}

function haystackContainsNameToken(haystack: string, tokens: string[]): boolean {
  const lower = haystack.toLowerCase();
  return tokens.some((token) => lower.includes(token));
}

function haystackContainsTeamNumber(haystack: string, teamNumber: number): boolean {
  return new RegExp(`(^|[^0-9])${teamNumber}([^0-9]|$)`).test(haystack);
}

export function inferSeasonHintFromText(text: string | null | undefined): number | null {
  if (!text) {
    return null;
  }
  const years: number[] = [];
  for (const match of text.matchAll(/\b(201[6-9]|202[0-9]|2030)\b/g)) {
    years.push(Number(match[1]));
  }
  if (years.length === 0) {
    return null;
  }
  return Math.max(...years);
}

function evidenceKindFromLink(link: TeamLink): VideoResourceEvidenceKind {
  if (isOpenAllianceLinkSource(link.source)) {
    return 'open-alliance';
  }
  if (isGm0LinkSource(link.source)) {
    return 'gm0-gallery';
  }
  return 'declared-link';
}

function confidenceForKind(kind: VideoResourceEvidenceKind): LinkOwnershipConfidence {
  if (kind === 'open-alliance' || kind === 'gm0-gallery' || kind === 'declared-link') {
    return 'high';
  }
  return 'medium';
}

function confidenceRank(value: LinkOwnershipConfidence | undefined): number {
  if (value === 'high') return 3;
  if (value === 'medium') return 2;
  if (value === 'low') return 1;
  return 0;
}

function evidenceTextForCandidate(
  teamNumber: number,
  kind: VideoResourceEvidenceKind,
  link: TeamLink | null,
  hit: YoutubeSearchHit | null,
): string {
  if (kind === 'open-alliance') {
    return (
      `YouTube resource declared on Open Alliance for team ${teamNumber}` +
      (link?.evidence ? ` (${link.evidence})` : '') +
      '; ownership not inferred from team number or name alone.'
    );
  }
  if (kind === 'gm0-gallery') {
    return (
      `YouTube resource listed on Game Manual 0 gallery for team ${teamNumber}` +
      (link?.evidence ? ` (${link.evidence})` : '') +
      '; ownership not inferred from team number or name alone.'
    );
  }
  if (kind === 'declared-link') {
    return (
      `YouTube resource discovered from team-declared / crawled public links` +
      (link?.source ? ` (source: ${link.source})` : '') +
      (link?.evidence ? `; ${link.evidence}` : '') +
      '; ownership not inferred from team number or name alone.'
    );
  }
  return (
    `YouTube search hit for team ${teamNumber} corroborated by team-name tokens` +
    (hit?.title ? ` in "${hit.title}"` : '') +
    (hit?.channelTitle ? ` / channel ${hit.channelTitle}` : '') +
    '; name-only and number-only matches are rejected.'
  );
}

/**
 * Collect YouTube candidates already present on the team (website / OA / GM0 links).
 * High-trust when declared; verification enriches metadata without claiming name-only ownership.
 */
export function collectYoutubeCandidatesFromLinks(team: Team): YoutubeCandidate[] {
  const byUrl = new Map<string, YoutubeCandidate>();

  for (const link of team.links ?? []) {
    const parsed = parseYoutubeUrl(link.url);
    if (!parsed) {
      continue;
    }
    if (!isAllowedPublicTeamLink(parsed.url, team)) {
      continue;
    }

    const evidenceKind = evidenceKindFromLink(link);
    const candidate: YoutubeCandidate = {
      url: parsed.url,
      kind: parsed.kind,
      channelId: parsed.channelId,
      handle: parsed.handle,
      videoId: parsed.videoId,
      playlistId: parsed.playlistId,
      evidenceKind,
      source: link.source || YOUTUBE_SOURCE,
      evidence: evidenceTextForCandidate(team.number, evidenceKind, link, null),
      ownershipConfidence: link.ownershipConfidence ?? confidenceForKind(evidenceKind),
      titleHint: link.label || null,
    };

    const existing = byUrl.get(parsed.url);
    if (!existing || confidenceRank(candidate.ownershipConfidence) >= confidenceRank(existing.ownershipConfidence)) {
      byUrl.set(parsed.url, candidate);
    }
  }

  return [...byUrl.values()];
}

/**
 * Ownership gate for optional YouTube search hits.
 * Name-only matches (common team names without number corroboration) are rejected.
 * Number-only matches without name tokens are also rejected.
 */
export function evaluateYoutubeSearchOwnership(args: {
  teamNumber: number;
  teamName: string;
  hit: YoutubeSearchHit;
  /** Pre-declared candidate URLs for this team (website / OA / GM0). */
  declaredUrls?: ReadonlySet<string>;
}): { accepted: boolean; reason: string; evidenceKind?: VideoResourceEvidenceKind } {
  const parsed = parseYoutubeUrl(args.hit.url);
  if (!parsed) {
    return { accepted: false, reason: 'not a public YouTube channel/video/playlist URL' };
  }

  if (args.declaredUrls?.has(parsed.url)) {
    return {
      accepted: true,
      reason: 'already declared on team links (website / OA / GM0)',
      evidenceKind: 'declared-link',
    };
  }

  // Tolerate callers that pass non-normalized declared URLs.
  if (args.declaredUrls) {
    for (const declared of args.declaredUrls) {
      const declaredParsed = parseYoutubeUrl(declared);
      if (declaredParsed && declaredParsed.url === parsed.url) {
        return {
          accepted: true,
          reason: 'already declared on team links (website / OA / GM0)',
          evidenceKind: 'declared-link',
        };
      }
    }
  }

  const haystack = [
    parsed.url,
    args.hit.title ?? '',
    args.hit.description ?? '',
    args.hit.channelTitle ?? '',
  ].join(' ');
  const hasNumber = haystackContainsTeamNumber(haystack, args.teamNumber);
  const tokens = teamNameTokens(args.teamName);
  const hasName = tokens.length > 0 && haystackContainsNameToken(haystack, tokens);

  // Explicit name-only flag or name without number → reject (common team names collide).
  if (args.hit.matchedOnNumberOnly !== true && hasName && !hasNumber) {
    return {
      accepted: false,
      reason:
        'name-only YouTube match rejected — ownership requires team-number corroboration plus declared or search evidence',
    };
  }

  if ((args.hit.matchedOnNumberOnly === true || hasNumber) && !hasName) {
    return {
      accepted: false,
      reason:
        'number-only YouTube match rejected — ownership requires evidence beyond team number alone',
    };
  }

  if (hasNumber && hasName) {
    return {
      accepted: true,
      reason: 'team number plus team-name token corroboration',
      evidenceKind: 'search-corroborated',
    };
  }

  return {
    accepted: false,
    reason: 'insufficient ownership evidence (need declared link or number + name corroboration)',
  };
}

function isQuotaExhaustionStatus(status: number, bodyText: string): boolean {
  if (status === 429) {
    return true;
  }
  if (status !== 403) {
    return false;
  }
  return /quota|rate.?limit|dailyLimitExceeded|userRateLimitExceeded/i.test(bodyText);
}

/**
 * Low-level Data API GET with optional cache. Returns SourceResult on HTTP/network failure.
 * Requires a non-empty API key — callers should skip when {@link readYoutubeApiKey} is null.
 */
export async function fetchYoutubeApiJson(
  pathAndQuery: string,
  options: {
    apiKey: string;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
    cache?: YoutubeResponseCache;
    cacheKey?: string;
  },
): Promise<SourceResult<unknown>> {
  const cacheKey = options.cacheKey ?? pathAndQuery;
  const cached = options.cache?.get<unknown>(cacheKey);
  if (cached !== undefined) {
    return { ok: true, state: 'available', data: cached, diagnostics: 'cache-hit' };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const separator = pathAndQuery.includes('?') ? '&' : '?';
  const url = `${YOUTUBE_API_BASE}${pathAndQuery}${separator}key=${encodeURIComponent(options.apiKey)}`;

  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': YOUTUBE_USER_AGENT,
      },
      signal: options.signal,
    });

    const bodyText = await response.text();
    if (!response.ok) {
      if (isQuotaExhaustionStatus(response.status, bodyText)) {
        const failure = failureFromHttpStatus(
          response.status === 403 ? 429 : response.status,
          YOUTUBE_SOURCE,
          `YouTube Data API quota/rate limit: HTTP ${response.status}`,
        );
        return failure;
      }
      return failureFromHttpStatus(
        response.status,
        YOUTUBE_SOURCE,
        `YouTube Data API HTTP ${response.status}`,
      );
    }

    let data: unknown;
    try {
      data = JSON.parse(bodyText) as unknown;
    } catch {
      return {
        ok: false,
        state: 'parse_failure',
        userMessage: userMessageFor('parse_failure', YOUTUBE_SOURCE),
        diagnostics: 'YouTube Data API returned non-JSON body',
      };
    }

    options.cache?.set(cacheKey, data);
    return { ok: true, state: 'available', data };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      state: 'network_failure',
      userMessage: userMessageFor('network_failure', YOUTUBE_SOURCE),
      diagnostics: detail,
    };
  }
}

function pickSnippet(raw: Record<string, unknown> | undefined): YoutubeResourceMetadata {
  const snippet = (raw?.snippet ?? {}) as Record<string, unknown>;
  return {
    title: typeof snippet.title === 'string' ? snippet.title : null,
    publishedAt: typeof snippet.publishedAt === 'string' ? snippet.publishedAt : null,
    description: typeof snippet.description === 'string' ? snippet.description : null,
    channelId: typeof snippet.channelId === 'string' ? snippet.channelId : null,
  };
}

/**
 * Optional Data API metadata for a parsed resource. Fail-soft; never throws for HTTP errors.
 * When no API key is configured, returns null without calling the network.
 */
export async function fetchYoutubeResourceMetadata(
  resource: ParsedYoutubeResource,
  options?: {
    apiKey?: string | null;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
    cache?: YoutubeResponseCache;
  },
): Promise<{ metadata: YoutubeResourceMetadata | null; result?: SourceResult<unknown>; cacheHit?: boolean }> {
  const apiKey = options?.apiKey ?? null;
  if (!apiKey) {
    return { metadata: null };
  }

  let pathAndQuery: string | null = null;
  let cacheKey: string | null = null;

  if (resource.kind === 'video' && resource.videoId) {
    pathAndQuery = `/videos?part=snippet&id=${encodeURIComponent(resource.videoId)}`;
    cacheKey = `videos:${resource.videoId}`;
  } else if (resource.kind === 'playlist' && resource.playlistId) {
    pathAndQuery = `/playlists?part=snippet&id=${encodeURIComponent(resource.playlistId)}`;
    cacheKey = `playlists:${resource.playlistId}`;
  } else if (resource.kind === 'channel') {
    if (resource.channelId) {
      pathAndQuery = `/channels?part=snippet&id=${encodeURIComponent(resource.channelId)}`;
      cacheKey = `channels:id:${resource.channelId}`;
    } else if (resource.handle) {
      const handle = resource.handle.replace(/^@/, '');
      pathAndQuery = `/channels?part=snippet&forHandle=${encodeURIComponent(handle)}`;
      cacheKey = `channels:handle:${handle.toLowerCase()}`;
    }
  }

  if (!pathAndQuery || !cacheKey) {
    return { metadata: null };
  }

  const beforeSize = options?.cache?.size ?? 0;
  const hadKey = options?.cache?.get(cacheKey) !== undefined;
  const result = await fetchYoutubeApiJson(pathAndQuery, {
    apiKey,
    fetchImpl: options?.fetchImpl,
    signal: options?.signal,
    cache: options?.cache,
    cacheKey,
  });

  if (!result.ok) {
    return { metadata: null, result };
  }

  const cacheHit = hadKey || (result.diagnostics === 'cache-hit' && (options?.cache?.size ?? 0) >= beforeSize);
  const payload = result.data as { items?: Array<Record<string, unknown>> };
  const item = payload.items?.[0];
  if (!item) {
    return { metadata: null, result, cacheHit };
  }

  const metadata = pickSnippet(item);
  if (resource.kind === 'channel' && typeof item.id === 'string') {
    metadata.channelId = item.id;
  }
  return { metadata, result, cacheHit };
}

function toVideoResource(
  candidate: YoutubeCandidate,
  metadata: YoutubeResourceMetadata | null,
  retrievedAt: string | null,
): TeamVideoResource {
  const title = metadata?.title ?? candidate.titleHint ?? null;
  const publishedAt = metadata?.publishedAt ?? candidate.publishedAtHint ?? null;
  const description = metadata?.description ?? candidate.descriptionHint ?? null;
  const seasonHint = inferSeasonHintFromText(`${title ?? ''} ${description ?? ''}`);

  return {
    url: candidate.url,
    kind: candidate.kind,
    title,
    publishedAt,
    seasonHint,
    channelId: metadata?.channelId ?? candidate.channelId,
    videoId: candidate.videoId,
    playlistId: candidate.playlistId,
    evidence: candidate.evidence,
    evidenceKind: candidate.evidenceKind,
    ownershipConfidence: candidate.ownershipConfidence,
    confirmationState: 'unconfirmed' satisfies LinkConfirmation,
    source: YOUTUBE_SOURCE,
    retrievedAt,
  };
}

/**
 * Verify and store public YouTube resources for teams.
 * Default path: candidates from existing links (website / OA / GM0) — works without an API key.
 * Optional Data API metadata when `YOUTUBE_API_KEY` / options.apiKey is present.
 * Optional search hits must pass {@link evaluateYoutubeSearchOwnership} (name-only rejected).
 */
export async function applyYoutubeVideoEnrichment(
  teams: Team[],
  options?: {
    retrievedAt?: string | null;
    fetchImpl?: typeof fetch;
    apiKey?: string | null;
    /** Optional search hits keyed by team number (tests / careful operators). */
    searchHitsByTeam?: Map<number, YoutubeSearchHit[]>;
    /** When false, skip Data API metadata (still stores URL/kind/evidence). Default true when key present. */
    fetchMetadata?: boolean;
    cache?: YoutubeResponseCache;
  },
): Promise<ApplyYoutubeEnrichmentResult> {
  const retrievedAt = options?.retrievedAt ?? null;
  const apiKey = options?.apiKey !== undefined ? options.apiKey : null;
  const fetchMetadata = options?.fetchMetadata !== false && Boolean(apiKey);
  const cache = options?.cache ?? new YoutubeResponseCache();

  let matchedTeams = 0;
  let resourcesAdded = 0;
  let candidatesSeen = 0;
  let rejectedNameOnly = 0;
  let skippedInvalid = 0;
  let apiCalls = 0;
  let cacheHits = 0;
  let apiFailure: SourceResult<unknown> | undefined;

  for (const team of teams) {
    const declared = collectYoutubeCandidatesFromLinks(team);
    const declaredUrls = new Set(declared.map((candidate) => candidate.url));
    const candidates = new Map<string, YoutubeCandidate>();

    for (const candidate of declared) {
      candidates.set(candidate.url, candidate);
    }

    const searchHits = options?.searchHitsByTeam?.get(team.number) ?? [];
    for (const hit of searchHits) {
      candidatesSeen += 1;
      const verdict = evaluateYoutubeSearchOwnership({
        teamNumber: team.number,
        teamName: team.latestName,
        hit,
        declaredUrls,
      });
      if (!verdict.accepted) {
        if (/name-only|number-only/i.test(verdict.reason)) {
          rejectedNameOnly += 1;
        }
        continue;
      }

      const parsed = parseYoutubeUrl(hit.url);
      if (!parsed || !isAllowedPublicTeamLink(parsed.url, team)) {
        skippedInvalid += 1;
        continue;
      }

      if (candidates.has(parsed.url)) {
        continue;
      }

      const evidenceKind = verdict.evidenceKind ?? 'search-corroborated';
      candidates.set(parsed.url, {
        url: parsed.url,
        kind: parsed.kind,
        channelId: hit.channelId ?? parsed.channelId,
        handle: parsed.handle,
        videoId: hit.videoId ?? parsed.videoId,
        playlistId: hit.playlistId ?? parsed.playlistId,
        evidenceKind,
        source: YOUTUBE_SOURCE,
        evidence: evidenceTextForCandidate(team.number, evidenceKind, null, hit),
        ownershipConfidence: confidenceForKind(evidenceKind),
        titleHint: hit.title ?? null,
        publishedAtHint: hit.publishedAt ?? null,
        descriptionHint: hit.description ?? null,
      });
    }

    candidatesSeen += declared.length;
    if (candidates.size === 0) {
      continue;
    }

    matchedTeams += 1;
    const existing = new Map((team.videoResources ?? []).map((resource) => [resource.url, resource]));
    const before = existing.size;

    for (const candidate of candidates.values()) {
      let metadata: YoutubeResourceMetadata | null = null;
      if (fetchMetadata && apiKey && !apiFailure) {
        const parsed: ParsedYoutubeResource = {
          url: candidate.url,
          kind: candidate.kind,
          channelId: candidate.channelId,
          handle: candidate.handle,
          videoId: candidate.videoId,
          playlistId: candidate.playlistId,
        };
        const fetched = await fetchYoutubeResourceMetadata(parsed, {
          apiKey,
          fetchImpl: options?.fetchImpl,
          cache,
        });
        if (fetched.cacheHit) {
          cacheHits += 1;
        } else if (fetched.result) {
          apiCalls += 1;
        }
        if (fetched.result && !fetched.result.ok) {
          apiFailure = fetched.result;
          // Continue storing declared / corroborated evidence without metadata.
        } else {
          metadata = fetched.metadata;
        }
      }

      const resource = toVideoResource(candidate, metadata, retrievedAt);
      const prior = existing.get(resource.url);
      if (!prior) {
        existing.set(resource.url, resource);
        continue;
      }

      existing.set(resource.url, {
        ...prior,
        ...resource,
        ownershipConfidence:
          confidenceRank(prior.ownershipConfidence) >= confidenceRank(resource.ownershipConfidence)
            ? prior.ownershipConfidence
            : resource.ownershipConfidence,
        evidence: resource.evidence || prior.evidence,
        title: resource.title ?? prior.title,
        publishedAt: resource.publishedAt ?? prior.publishedAt,
        seasonHint: resource.seasonHint ?? prior.seasonHint,
        channelId: resource.channelId ?? prior.channelId,
      });
    }

    resourcesAdded += Math.max(0, existing.size - before);
    team.videoResources = [...existing.values()].sort(
      (a, b) => a.kind.localeCompare(b.kind) || a.url.localeCompare(b.url),
    );
  }

  return {
    matchedTeams,
    resourcesAdded,
    candidatesSeen,
    rejectedNameOnly,
    skippedInvalid,
    apiCalls,
    cacheHits,
    apiFailure,
  };
}
