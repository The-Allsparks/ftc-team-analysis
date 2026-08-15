import { SeasonId, TARGET_SEASONS } from '../data/schema';
import { CACHE_TTL, cacheKey, getCached, seasonTtl, setCached } from './ftcCache';
import {
  failureFromHttpStatus,
  failureFromUnknown,
  isCacheableSuccess,
  SourceResult,
} from './sourceResult';

export const FTC_SCORING_BASE_URL = 'https://ftc-scoring.firstinspires.org';
const PROXY_PREFIX = '/ftc-scoring-proxy';
const AVATAR_SOURCE_LABEL = 'Team avatars';

/** FTC Events links composed avatar CSS by the season-ending calendar year (e.g. game season 2025 → 2026.css). */
export function avatarComposedYear(season: SeasonId): number {
  return season + 1;
}

export function toFtcScoringProxyUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${PROXY_PREFIX}${normalized}`;
}

export function composedAvatarStylesheetPath(composedYear: number): string {
  return `/avatars/composed/${composedYear}.css`;
}

function cssCacheKey(composedYear: number): string {
  return cacheKey('avatar-css', String(composedYear));
}

function cssTtl(composedYear: number): number {
  const latestSeason = TARGET_SEASONS[0];
  const impliedSeason = (composedYear - 1) as SeasonId;
  return seasonTtl(
    impliedSeason,
    latestSeason,
    CACHE_TTL.currentSeasonTeamMs,
    CACHE_TTL.olderSeasonTeamMs,
  );
}

export function parseTeamAvatarPathFromCss(css: string, teamNumber: number): string | null {
  const pattern = new RegExp(
    `\\.team-${teamNumber}\\s*\\{[^}]*background-image:\\s*url\\("([^"]+)"\\)`,
    'i',
  );
  return css.match(pattern)?.[1] ?? null;
}

export function teamAvatarImageUrl(relativePath: string): string {
  return toFtcScoringProxyUrl(relativePath);
}

export async function fetchComposedAvatarCss(
  composedYear: number,
  options?: { force?: boolean },
): Promise<SourceResult<string>> {
  const key = cssCacheKey(composedYear);
  const ttl = cssTtl(composedYear);

  if (!options?.force) {
    const cached = getCached<string>(key, ttl);
    if (cached) {
      return {
        ok: true,
        state: 'available',
        data: cached,
        diagnostics: 'Loaded from local cache.',
      };
    }
  }

  let response: Response;

  try {
    response = await fetch(toFtcScoringProxyUrl(composedAvatarStylesheetPath(composedYear)), {
      headers: { accept: 'text/css,*/*' },
    });
  } catch (error) {
    return failureFromUnknown(error instanceof TypeError ? error : new TypeError(String(error)), AVATAR_SOURCE_LABEL);
  }

  if (response.status === 404) {
    return {
      ok: true,
      state: 'no_record',
      data: '',
      diagnostics: `FTC Scoring avatar stylesheet ${composedYear} returned 404.`,
    };
  }

  if (!response.ok) {
    return failureFromHttpStatus(
      response.status,
      AVATAR_SOURCE_LABEL,
      `FTC Scoring avatar stylesheet ${composedYear} failed with ${response.status}`,
    );
  }

  const css = await response.text();
  const result: SourceResult<string> = {
    ok: true,
    state: css.trim().length > 0 ? 'available' : 'no_record',
    data: css,
  };

  if (isCacheableSuccess(result)) {
    setCached(key, css);
  }

  return result;
}

export async function resolveTeamAvatarUrl(
  season: SeasonId,
  teamNumber: number,
  options?: { force?: boolean },
): Promise<SourceResult<string | null>> {
  const composedYear = avatarComposedYear(season);
  const cssResult = await fetchComposedAvatarCss(composedYear, options);

  if (!cssResult.ok) {
    return {
      ok: false,
      state: cssResult.state,
      userMessage: cssResult.userMessage,
      diagnostics: cssResult.diagnostics,
    };
  }

  const relativePath = parseTeamAvatarPathFromCss(cssResult.data, teamNumber);
  return {
    ok: true,
    state: relativePath ? 'available' : 'no_record',
    data: relativePath ? teamAvatarImageUrl(relativePath) : null,
  };
}

export function teamAvatarAttributionUrl(): string {
  return `${FTC_SCORING_BASE_URL}/avatars/composed/`;
}

export function avatarCssCacheKeyForTests(composedYear: number): string {
  return cssCacheKey(composedYear);
}
