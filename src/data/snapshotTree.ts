/**
 * Build the static snapshot tree from a validated GeneratedData mega-seed (#87).
 * Filesystem writes live in scripts/snapshotTreeWrite.ts (Node-only).
 */
import { STALE_SEED_MAX_AGE_MS } from '../lib/sourceHealthReport';
import type { GeneratedData, Team, TeamSeason } from './schema';
import { availableSeasons, CURRENT_SEASON, isSupportedSeason, type SeasonId } from './seasons';
import {
  SNAPSHOT_CACHE_TTL,
  SNAPSHOT_PATH_TEMPLATES,
  SNAPSHOT_TREE_SCHEMA_VERSION,
  teamIndexPath,
  teamSeasonPath,
  type RegionSeasonSummary,
  type SnapshotManifest,
  type SnapshotSourceHealth,
  type TeamSeasonSnapshot,
  type TeamSnapshotIndex,
} from './snapshotTreeSchema';

export type SnapshotTreeBuildResult = {
  manifest: SnapshotManifest;
  regionSummaries: RegionSeasonSummary[];
  teamIndexes: TeamSnapshotIndex[];
  teamSeasons: TeamSeasonSnapshot[];
  sourceHealth: SnapshotSourceHealth;
  fileCount: number;
};

/** #38 baseline table (re-measured 2026-08-14) for PR/docs comparison. */
export const ISSUE_38_SIZE_BASELINE = {
  measuredAt: '2026-08-14',
  generatedAt: '2026-06-24T04:37:06.788Z',
  teamCount: 113,
  formattedBytes: 1_739_610,
  minifiedBytes: 1_128_924,
  minifiedGzipBytes: 67_400,
  summaryGzipBytes: 2_716,
  avgTeamGzipBytes: 1_350,
} as const;

function seasonIdsForTeam(team: Team): SeasonId[] {
  return Object.keys(team.seasons ?? {})
    .map(Number)
    .filter(isSupportedSeason)
    .sort((a, b) => b - a);
}

function buildRegionSummary(data: GeneratedData, season: SeasonId): RegionSeasonSummary {
  const teams = data.teams
    .map((team) => {
      const row = team.seasons[season];
      if (!row) {
        return null;
      }
      return {
        number: team.number,
        name: row.name,
        location: row.location,
        teamType: row.teamType,
        league: row.league,
        city: row.city,
        active: row.active,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => a.number - b.number);

  return {
    schemaVersion: SNAPSHOT_TREE_SCHEMA_VERSION,
    regionCode: data.regionCode,
    season,
    generatedAt: data.generatedAt,
    teamCount: teams.length,
    teams,
  };
}

function buildTeamIndex(data: GeneratedData, team: Team): TeamSnapshotIndex {
  const seasons = seasonIdsForTeam(team);
  const seasonPaths: Record<string, string> = {};
  for (const season of seasons) {
    seasonPaths[String(season)] = teamSeasonPath(team.number, season);
  }

  return {
    schemaVersion: SNAPSHOT_TREE_SCHEMA_VERSION,
    number: team.number,
    generatedAt: data.generatedAt,
    latestName: team.latestName,
    latestLocation: team.latestLocation,
    latestCity: team.latestCity,
    latestState: team.latestState,
    latestCountry: team.latestCountry,
    latestRookieYear: team.latestRookieYear,
    latestOrganization: team.latestOrganization,
    latestWebsite: team.latestWebsite,
    latestTeamType: team.latestTeamType,
    latestLeague: team.latestLeague,
    latestRegion: team.latestRegion,
    seasons,
    seasonPaths,
    indexPath: teamIndexPath(team.number),
    links: team.links ?? [],
    ...(team.codeRepositories && team.codeRepositories.length > 0
      ? { codeRepositories: team.codeRepositories }
      : {}),
    ...(team.videoResources && team.videoResources.length > 0 ? { videoResources: team.videoResources } : {}),
  };
}

function buildTeamSeason(
  data: GeneratedData,
  team: Team,
  season: SeasonId,
  detail: TeamSeason,
): TeamSeasonSnapshot {
  return {
    schemaVersion: SNAPSHOT_TREE_SCHEMA_VERSION,
    number: team.number,
    season,
    generatedAt: data.generatedAt,
    detail: detail as unknown as Record<string, unknown>,
  };
}

/** Static `/data/source-health.json` slice from seed `sourceChecks` + #30 age helpers. */
export function buildSourceHealth(
  data: GeneratedData,
  now: Date | string | number = Date.now(),
): SnapshotSourceHealth {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const generatedMs = new Date(data.generatedAt).getTime();
  const seedAgeMs = Number.isFinite(generatedMs) ? Math.max(0, nowMs - generatedMs) : 0;
  const sourceChecks = data.sourceChecks ?? [];
  const sourceCheckFailureCount = sourceChecks.filter((check) => !check.ok).length;

  return {
    schemaVersion: SNAPSHOT_TREE_SCHEMA_VERSION,
    generatedAt: data.generatedAt,
    regionCode: data.regionCode,
    teamCount: data.teams.length,
    seedAgeMs,
    seedStale: seedAgeMs > STALE_SEED_MAX_AGE_MS,
    sourceCheckFailureCount,
    sourceChecks,
  };
}

function buildManifest(
  data: GeneratedData,
  treeGeneratedAt: string,
  seasons: SeasonId[],
): SnapshotManifest {
  const teams = [...data.teams]
    .sort((a, b) => a.number - b.number)
    .map((team) => ({
      number: team.number,
      latestName: team.latestName,
      path: teamIndexPath(team.number),
    }));

  return {
    schemaVersion: SNAPSHOT_TREE_SCHEMA_VERSION,
    generatedAt: data.generatedAt,
    treeGeneratedAt,
    regionCode: data.regionCode,
    ...(data.regionLabel ? { regionLabel: data.regionLabel } : {}),
    currentSeason: CURRENT_SEASON,
    seasons,
    teamCount: teams.length,
    teams,
    paths: { ...SNAPSHOT_PATH_TEMPLATES },
    cachePolicy: {
      ...SNAPSHOT_CACHE_TTL,
      note:
        'TTLs for #38/#89. Historical season JSON uses long immutable caching in public/_headers; current season, manifest, mega-seed, and team index stay short. See docs/edge-cache.md.',
    },
  };
}

/** Pure in-memory build (caller must publish-guard before writing). */
export function buildSnapshotTree(
  data: GeneratedData,
  treeGeneratedAt: string = new Date().toISOString(),
): SnapshotTreeBuildResult {
  const seasons = [...new Set([...data.targetSeasons, ...availableSeasons(data)])].sort(
    (a, b) => b - a,
  ) as SeasonId[];

  const regionSummaries = seasons.map((season) => buildRegionSummary(data, season));
  const teamIndexes = [...data.teams]
    .sort((a, b) => a.number - b.number)
    .map((team) => buildTeamIndex(data, team));

  const teamSeasons: TeamSeasonSnapshot[] = [];
  for (const team of data.teams) {
    for (const season of seasonIdsForTeam(team)) {
      const detail = team.seasons[season];
      if (detail) {
        teamSeasons.push(buildTeamSeason(data, team, season, detail));
      }
    }
  }

  const sourceHealth = buildSourceHealth(data, treeGeneratedAt);
  const manifest = buildManifest(data, treeGeneratedAt, seasons);
  const fileCount =
    2 /* manifest + source-health */ + regionSummaries.length + teamIndexes.length + teamSeasons.length;

  return {
    manifest,
    regionSummaries,
    teamIndexes,
    teamSeasons,
    sourceHealth,
    fileCount,
  };
}

export type SnapshotTreeSizeRow = {
  form: string;
  bytes: number;
  label: string;
};

export function formatSizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${bytes.toLocaleString('en-US')} bytes (${(bytes / (1024 * 1024)).toFixed(2)} MiB)`;
  }
  if (bytes >= 1024) {
    return `${bytes.toLocaleString('en-US')} bytes (${(bytes / 1024).toFixed(2)} KiB)`;
  }
  return `${bytes.toLocaleString('en-US')} bytes (${bytes} B)`;
}

export function formatSizeComparisonMarkdown(
  sizes: SnapshotTreeSizeRow[],
  teamCount: number,
  generatedAt: string,
): string {
  const byForm = Object.fromEntries(sizes.map((row) => [row.form, row]));
  const lines = [
    `### Snapshot size re-measure (vs [#38](https://github.com/The-Allsparks/ftc-team-analysis/issues/38) 2026-08-14 table)`,
    '',
    `Seed \`generatedAt\`: \`${generatedAt}\` · team count: **${teamCount}** (baseline ${ISSUE_38_SIZE_BASELINE.teamCount}).`,
    '',
    '| Form | #38 baseline (2026-08-14) | This seed |',
    '| --- | ---: | ---: |',
    `| Formatted mega-seed JSON on disk | ${formatSizeLabel(ISSUE_38_SIZE_BASELINE.formattedBytes)} | ${byForm['Formatted mega-seed JSON on disk']?.label ?? '—'} |`,
    `| Minified mega-seed JSON | ${formatSizeLabel(ISSUE_38_SIZE_BASELINE.minifiedBytes)} | ${byForm['Minified mega-seed JSON']?.label ?? '—'} |`,
    `| gzip of minified mega-seed (zlib level 9) | ${formatSizeLabel(ISSUE_38_SIZE_BASELINE.minifiedGzipBytes)} | ${byForm['gzip of minified mega-seed (zlib level 9)']?.label ?? '—'} |`,
    `| Lightweight region summary gzip | ${formatSizeLabel(ISSUE_38_SIZE_BASELINE.summaryGzipBytes)} | ${sizes.find((s) => s.form.startsWith('Lightweight region summary'))?.label ?? '—'} |`,
    `| Average individual team-season gzip | ${formatSizeLabel(ISSUE_38_SIZE_BASELINE.avgTeamGzipBytes)} | ${byForm['Average individual team-season snapshot gzip']?.label ?? '—'} |`,
    '',
  ];
  return lines.join('\n');
}
