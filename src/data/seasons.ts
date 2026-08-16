/**
 * Season model: supported vs current vs available.
 *
 * - supported: seasons the app can name/validate (game labels, seed schema).
 * - current: explicit config for pull --mode=current and UI defaults (not max(supported)).
 * - available: seasons present in ingested seed/team data (drives the filter dropdown).
 *
 * Auto-discovery via the authenticated FIRST API is out of scope (#17).
 */

export const SUPPORTED_SEASONS = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019] as const;

export type SeasonId = (typeof SUPPORTED_SEASONS)[number];

/** Explicit current competition season — update this one line when FIRST rolls forward. */
export const CURRENT_SEASON: SeasonId = 2026;

/**
 * @deprecated Prefer SUPPORTED_SEASONS. Kept as an alias so existing imports keep working.
 */
export const TARGET_SEASONS = SUPPORTED_SEASONS;

export function isSupportedSeason(value: number): value is SeasonId {
  return (SUPPORTED_SEASONS as readonly number[]).includes(value);
}

export function currentSeason(): SeasonId {
  return CURRENT_SEASON;
}

export type SeasonDataSlice = {
  targetSeasons?: number[];
  teams?: { seasons?: Partial<Record<number, unknown>> }[];
};

/** Seasons present in ingested data, newest first. Unsupported years are dropped. */
export function availableSeasons(data?: SeasonDataSlice): SeasonId[] {
  const fromTeams =
    data?.teams?.flatMap((team) =>
      Object.keys(team.seasons ?? {}).map((season) => Number(season)),
    ) ?? [];
  const fromTarget = data?.targetSeasons ?? [];

  return [...new Set([...fromTarget, ...fromTeams])]
    .filter(isSupportedSeason)
    .sort((a, b) => b - a);
}

/**
 * Dropdown seasons: available data plus current (even with zero team rows).
 * Unsupported seasons are never listed.
 */
export function seasonFilterOptions(data?: SeasonDataSlice): SeasonId[] {
  const available = availableSeasons(data);
  return [...new Set([CURRENT_SEASON, ...available])].sort((a, b) => b - a);
}

/** Newest available season with team rows, else newest available target, else current. */
export function lastAvailableSeason(data?: SeasonDataSlice): SeasonId {
  const withTeams =
    data?.teams?.flatMap((team) =>
      Object.keys(team.seasons ?? {}).map((season) => Number(season)),
    ) ?? [];
  const fromTeams = [...new Set(withTeams)].filter(isSupportedSeason).sort((a, b) => b - a);
  if (fromTeams[0] !== undefined) {
    return fromTeams[0];
  }

  const available = availableSeasons(data);
  return available[0] ?? CURRENT_SEASON;
}

export function isCurrentSeason(season: SeasonId): boolean {
  return season === CURRENT_SEASON;
}
