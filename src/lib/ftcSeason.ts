import { SeasonId, TARGET_SEASONS } from '../data/schema';
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

export type ResolvedRegionSeason = {
  season: SeasonId;
  requestedSeason: SeasonId;
  usedFallback: boolean;
};

export async function resolvePublishedRegionSeason(
  regionCode: string,
  preferredSeason: SeasonId,
): Promise<ResolvedRegionSeason> {
  const orderedSeasons = [
    preferredSeason,
    ...TARGET_SEASONS.filter((season) => season !== preferredSeason),
  ];

  for (const season of orderedSeasons) {
    if (await isRegionSeasonPublished(regionCode, season)) {
      return {
        season,
        requestedSeason: preferredSeason,
        usedFallback: season !== preferredSeason,
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
 */
export function defaultSeasonWithData(
  seasons: SeasonId[],
  _teams?: { seasons?: Partial<Record<number, unknown>> }[],
): SeasonId {
  return seasons[0] ?? TARGET_SEASONS[0];
}
