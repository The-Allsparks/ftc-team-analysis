import { SeasonId, TARGET_SEASONS } from '../data/schema';
import { CACHE_TTL, cacheKey, getCached, seasonTtl, setCached } from './ftcCache';

export const FTC_SCORING_BASE_URL = 'https://ftc-scoring.firstinspires.org';
const PROXY_PREFIX = '/ftc-scoring-proxy';

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

export async function fetchComposedAvatarCss(composedYear: number, options?: { force?: boolean }): Promise<string> {
  const key = cssCacheKey(composedYear);
  const ttl = cssTtl(composedYear);

  if (!options?.force) {
    const cached = getCached<string>(key, ttl);
    if (cached) {
      return cached;
    }
  }

  const response = await fetch(toFtcScoringProxyUrl(composedAvatarStylesheetPath(composedYear)), {
    headers: { accept: 'text/css,*/*' },
  });

  if (!response.ok) {
    throw new Error(`FTC Scoring avatar stylesheet ${composedYear} failed with ${response.status}`);
  }

  const css = await response.text();
  setCached(key, css);
  return css;
}

export async function resolveTeamAvatarUrl(
  season: SeasonId,
  teamNumber: number,
  options?: { force?: boolean },
): Promise<string | null> {
  const composedYear = avatarComposedYear(season);

  try {
    const css = await fetchComposedAvatarCss(composedYear, options);
    const relativePath = parseTeamAvatarPathFromCss(css, teamNumber);
    return relativePath ? teamAvatarImageUrl(relativePath) : null;
  } catch {
    return null;
  }
}

export function teamAvatarAttributionUrl(): string {
  return `${FTC_SCORING_BASE_URL}/avatars/composed/`;
}
