import {
  CURRENT_SEASON,
  SeasonId,
  SUPPORTED_SEASONS,
  availableSeasons,
  lastAvailableSeason,
} from '../data/schema';
import { cacheKey, getCached, setCached } from './ftcCache';
import { fetchFtcOk } from './ftcFetch';

const PUBLISHED_TTL_MS = 60 * 60 * 1000;

function publishedCacheKey(regionCode: string, season: SeasonId): string {
  return cacheKey('region-published', regionCode, String(season));
}

export async function isRegionSeasonPublished(regionCode: string, season: SeasonId): Promise<boolean> {
  const key = publishedCacheKey(regionCode, season);
  const cached = getCached<boolean>(key, PUBLISHED_TTL_MS);

  if (cached !== null) {
    return cached;
  }

  const published = await fetchFtcOk(`/${season}/region/${regionCode}`);
  setCached(key, published);
  return published;
}

export type SeasonPublishStatus = 'published' | 'fallback' | 'unpublished';

export type ResolvedRegionSeason = {
  season: SeasonId;
  requestedSeason: SeasonId;
  usedFallback: boolean;
  status: SeasonPublishStatus;
};

/**
 * Prefer the requested season when published; otherwise fall back through
 * available then supported seasons. Callers must surface usedFallback in the UI.
 */
export async function resolvePublishedRegionSeason(
  regionCode: string,
  preferredSeason: SeasonId,
  data?: { targetSeasons?: number[]; teams?: { seasons?: Partial<Record<number, unknown>> }[] },
): Promise<ResolvedRegionSeason> {
  const available = availableSeasons(data);
  const orderedSeasons = [
    preferredSeason,
    ...available.filter((season) => season !== preferredSeason),
    ...SUPPORTED_SEASONS.filter(
      (season) => season !== preferredSeason && !available.includes(season),
    ),
  ];

  for (const season of orderedSeasons) {
    if (await isRegionSeasonPublished(regionCode, season)) {
      const usedFallback = season !== preferredSeason;
      return {
        season,
        requestedSeason: preferredSeason,
        usedFallback,
        status: usedFallback ? 'fallback' : 'published',
      };
    }
  }

  throw new Error(
    `No published FTC Events region pages were found for ${regionCode}. Try again later or choose a different region.`,
  );
}

/**
 * Prefer the newest listed season even when the local dataset still has zero
 * team-seasons for it (e.g. BIOBUZZ before the first live pull).
 * When the list is empty, fall back to CURRENT_SEASON.
 */
export function defaultSeasonWithData(
  seasons: SeasonId[],
  _teams?: { seasons?: Partial<Record<number, unknown>> }[],
): SeasonId {
  return seasons[0] ?? CURRENT_SEASON;
}

/**
 * Initial directory filter when current may be unpublished:
 * prefer last available ingested season (banner handled separately).
 */
export function initialSeasonFilter(
  data?: { targetSeasons?: number[]; teams?: { seasons?: Partial<Record<number, unknown>> }[] },
): SeasonId {
  return lastAvailableSeason(data);
}
