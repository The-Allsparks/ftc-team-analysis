/**
 * Edge Cache-Control policy for static `/data` snapshots and live proxy responses (#89 / #38).
 *
 * Static assets that never invoke Functions are the unlimited Free-tier path.
 * Proxy Cache-Control reduces upstream/browser repeat load; it does **not** make
 * Workers Caching HITs free of Function request quota.
 */
import { CURRENT_SEASON, SUPPORTED_SEASONS, type SeasonId } from '../data/seasons';
import { SNAPSHOT_CACHE_TTL } from '../data/snapshotTreeSchema';

export const STATIC_CURRENT_CACHE_CONTROL =
  `public, max-age=${SNAPSHOT_CACHE_TTL.currentMaxAgeSeconds}, stale-while-revalidate=86400` as const;

export const STATIC_HISTORICAL_CACHE_CONTROL =
  `public, max-age=${SNAPSHOT_CACHE_TTL.historicalMaxAgeSeconds}, immutable` as const;

export const STATIC_MEGA_SEED_CACHE_CONTROL =
  `public, max-age=${SNAPSHOT_CACHE_TTL.megaSeedMaxAgeSeconds}, stale-while-revalidate=86400` as const;

export const STATIC_APP_SHELL_CACHE_CONTROL = 'public, max-age=0, must-revalidate' as const;

export const STATIC_HASHED_ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable' as const;

/** Conservative proxy TTLs — no stale-while-revalidate (Cache API does not support SWR; keep CDN/browser simple). */
export const PROXY_CACHE_TTL_SECONDS = {
  ftcEventsCurrent: 60,
  ftcEventsHistorical: 3600,
  ftcScout: 120,
  portfolioLab: 300,
  ftcScoring: 600,
} as const;

export const PROXY_ERROR_CACHE_CONTROL = 'no-store' as const;

export type StaticDataCacheClass = 'current' | 'historical' | 'mega-seed';

export type ProxyUpstreamCacheClass =
  | 'ftc-events-current'
  | 'ftc-events-historical'
  | 'ftcscout'
  | 'portfolio-lab'
  | 'ftc-scoring';

/** Structural route shape (avoids importing liveProxy and creating a cycle). */
export type ProxyRouteLike = { prefix: string };

/** Seasons that should receive long immutable static TTLs (everything except CURRENT_SEASON). */
export function historicalSeasonsForHeaders(
  currentSeason: SeasonId = CURRENT_SEASON,
  supported: readonly SeasonId[] = SUPPORTED_SEASONS,
): SeasonId[] {
  return supported.filter((season) => season !== currentSeason).sort((a, b) => a - b);
}

export function parseSeasonFromProxyPath(pathname: string): SeasonId | null {
  const match = pathname.match(/\/(20\d{2})(?:\/|$)/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  return (SUPPORTED_SEASONS as readonly number[]).includes(year) ? (year as SeasonId) : null;
}

export function classifyStaticDataPath(pathname: string, currentSeason: SeasonId = CURRENT_SEASON): StaticDataCacheClass {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;

  if (
    path === '/data/nv-ftc-teams.generated.json' ||
    path === '/data/nv-ftc-team-observations.generated.json'
  ) {
    return 'mega-seed';
  }

  if (
    path === '/data/manifest.json' ||
    path === '/data/source-health.json' ||
    /^\/data\/teams\/\d+\/index\.json$/.test(path)
  ) {
    return 'current';
  }

  const regionMatch = path.match(/^\/data\/regions\/[^/]+\/(\d{4})\/summary\.json$/);
  if (regionMatch) {
    const season = Number(regionMatch[1]);
    return season === currentSeason ? 'current' : 'historical';
  }

  const teamSeasonMatch = path.match(/^\/data\/teams\/\d+\/(\d{4})\.json$/);
  if (teamSeasonMatch) {
    const season = Number(teamSeasonMatch[1]);
    return season === currentSeason ? 'current' : 'historical';
  }

  return 'current';
}

export function staticDataCacheControl(
  pathname: string,
  currentSeason: SeasonId = CURRENT_SEASON,
): string {
  switch (classifyStaticDataPath(pathname, currentSeason)) {
    case 'historical':
      return STATIC_HISTORICAL_CACHE_CONTROL;
    case 'mega-seed':
      return STATIC_MEGA_SEED_CACHE_CONTROL;
    default:
      return STATIC_CURRENT_CACHE_CONTROL;
  }
}

export function classifyProxyUpstream(
  route: ProxyRouteLike,
  pathname: string,
  currentSeason: SeasonId = CURRENT_SEASON,
): ProxyUpstreamCacheClass {
  switch (route.prefix) {
    case '/ftcscout-proxy':
      return 'ftcscout';
    case '/portfolio-lab-proxy':
      return 'portfolio-lab';
    case '/ftc-scoring-proxy':
      return 'ftc-scoring';
    case '/ftc-proxy': {
      const season = parseSeasonFromProxyPath(pathname);
      if (season !== null && season !== currentSeason) {
        return 'ftc-events-historical';
      }
      return 'ftc-events-current';
    }
    default:
      return 'ftc-events-current';
  }
}

export function proxyCacheControlForClass(cacheClass: ProxyUpstreamCacheClass): string {
  switch (cacheClass) {
    case 'ftc-events-historical':
      return `public, max-age=${PROXY_CACHE_TTL_SECONDS.ftcEventsHistorical}`;
    case 'ftcscout':
      return `public, max-age=${PROXY_CACHE_TTL_SECONDS.ftcScout}`;
    case 'portfolio-lab':
      return `public, max-age=${PROXY_CACHE_TTL_SECONDS.portfolioLab}`;
    case 'ftc-scoring':
      return `public, max-age=${PROXY_CACHE_TTL_SECONDS.ftcScoring}`;
    case 'ftc-events-current':
    default:
      return `public, max-age=${PROXY_CACHE_TTL_SECONDS.ftcEventsCurrent}`;
  }
}

export function proxyResponseCacheControl(
  route: ProxyRouteLike,
  pathname: string,
  status: number,
  currentSeason: SeasonId = CURRENT_SEASON,
): string {
  if (status < 200 || status >= 300) {
    return PROXY_ERROR_CACHE_CONTROL;
  }
  return proxyCacheControlForClass(classifyProxyUpstream(route, pathname, currentSeason));
}
