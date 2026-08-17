/**
 * Runtime schemas for the static snapshot tree (#87 / #38).
 *
 * Tree files are derived from the canonical mega-seed and served under `/data/`.
 * See docs/snapshot-tree.md.
 */
import * as v from 'valibot';
import { CURRENT_SEASON, SUPPORTED_SEASONS, type SeasonId } from './seasons';

export const SNAPSHOT_TREE_SCHEMA_VERSION = 1;

const seasonIdSchema = v.picklist(SUPPORTED_SEASONS);
const teamTypeSchema = v.picklist(['school', 'non-school', 'unknown']);
const nullableString = v.nullable(v.string());

/** Intended edge cache TTLs (seconds). Header wiring may land in #89. */
export const SNAPSHOT_CACHE_TTL = {
  /** Immutable historical season slices. */
  historicalMaxAgeSeconds: 30 * 24 * 60 * 60,
  /** Current-season region/team slices and manifest. */
  currentMaxAgeSeconds: 5 * 60,
  /** Mega-seed transitional path (matches today's public/_headers /data/*). */
  megaSeedMaxAgeSeconds: 5 * 60,
} as const;

export type SnapshotTeamIndexEntry = {
  number: number;
  latestName: string;
  path: string;
};

export type SnapshotManifest = {
  schemaVersion: number;
  generatedAt: string;
  treeGeneratedAt: string;
  regionCode: string;
  regionLabel?: string;
  currentSeason: SeasonId;
  seasons: SeasonId[];
  teamCount: number;
  teams: SnapshotTeamIndexEntry[];
  paths: {
    megaSeed: string;
    observations: string;
    sourceHealth: string;
    regionSummary: string;
    teamIndex: string;
    teamSeason: string;
  };
  cachePolicy: {
    historicalMaxAgeSeconds: number;
    currentMaxAgeSeconds: number;
    megaSeedMaxAgeSeconds: number;
    note: string;
  };
};

export type RegionSummaryTeam = {
  number: number;
  name: string;
  location: string;
  teamType: 'school' | 'non-school' | 'unknown';
  league: string | null;
  city: string | null;
  active: boolean;
};

export type RegionSeasonSummary = {
  schemaVersion: number;
  regionCode: string;
  season: SeasonId;
  generatedAt: string;
  teamCount: number;
  teams: RegionSummaryTeam[];
};

export type TeamSnapshotIndex = {
  schemaVersion: number;
  number: number;
  generatedAt: string;
  latestName: string;
  latestLocation: string;
  latestCity: string | null;
  latestState: string | null;
  latestCountry: string | null;
  latestRookieYear: number | null;
  latestOrganization: string | null;
  latestWebsite: string | null;
  latestTeamType: 'school' | 'non-school' | 'unknown';
  latestLeague: string | null;
  latestRegion: string | null;
  seasons: SeasonId[];
  seasonPaths: Record<string, string>;
  indexPath: string;
};

export type TeamSeasonSnapshot = {
  schemaVersion: number;
  number: number;
  season: SeasonId;
  generatedAt: string;
  /** Full season record from the mega-seed. */
  detail: Record<string, unknown>;
};

export type SnapshotSourceHealth = {
  schemaVersion: number;
  generatedAt: string;
  regionCode: string;
  teamCount: number;
  sourceChecks: Array<{
    label: string;
    url: string;
    checkedAt: string;
    ok: boolean;
    detail?: string;
  }>;
};

const teamIndexEntrySchema = v.object({
  number: v.number(),
  latestName: v.string(),
  path: v.string(),
});

export const snapshotManifestSchema = v.object({
  schemaVersion: v.literal(SNAPSHOT_TREE_SCHEMA_VERSION),
  generatedAt: v.pipe(v.string(), v.minLength(1)),
  treeGeneratedAt: v.pipe(v.string(), v.minLength(1)),
  regionCode: v.pipe(v.string(), v.minLength(1)),
  regionLabel: v.optional(v.string()),
  currentSeason: seasonIdSchema,
  seasons: v.pipe(v.array(seasonIdSchema), v.minLength(1)),
  teamCount: v.pipe(v.number(), v.minValue(1)),
  teams: v.pipe(v.array(teamIndexEntrySchema), v.minLength(1)),
  paths: v.object({
    megaSeed: v.string(),
    observations: v.string(),
    sourceHealth: v.string(),
    regionSummary: v.string(),
    teamIndex: v.string(),
    teamSeason: v.string(),
  }),
  cachePolicy: v.object({
    historicalMaxAgeSeconds: v.number(),
    currentMaxAgeSeconds: v.number(),
    megaSeedMaxAgeSeconds: v.number(),
    note: v.string(),
  }),
});

export const regionSeasonSummarySchema = v.object({
  schemaVersion: v.literal(SNAPSHOT_TREE_SCHEMA_VERSION),
  regionCode: v.pipe(v.string(), v.minLength(1)),
  season: seasonIdSchema,
  generatedAt: v.pipe(v.string(), v.minLength(1)),
  teamCount: v.pipe(v.number(), v.minValue(0)),
  teams: v.array(
    v.object({
      number: v.number(),
      name: v.string(),
      location: v.string(),
      teamType: teamTypeSchema,
      league: nullableString,
      city: nullableString,
      active: v.boolean(),
    }),
  ),
});

export const teamSnapshotIndexSchema = v.object({
  schemaVersion: v.literal(SNAPSHOT_TREE_SCHEMA_VERSION),
  number: v.number(),
  generatedAt: v.pipe(v.string(), v.minLength(1)),
  latestName: v.string(),
  latestLocation: v.string(),
  latestCity: nullableString,
  latestState: nullableString,
  latestCountry: nullableString,
  latestRookieYear: v.nullable(v.number()),
  latestOrganization: nullableString,
  latestWebsite: nullableString,
  latestTeamType: teamTypeSchema,
  latestLeague: nullableString,
  latestRegion: nullableString,
  seasons: v.array(seasonIdSchema),
  seasonPaths: v.record(v.string(), v.string()),
  indexPath: v.string(),
});

export const teamSeasonSnapshotSchema = v.object({
  schemaVersion: v.literal(SNAPSHOT_TREE_SCHEMA_VERSION),
  number: v.number(),
  season: seasonIdSchema,
  generatedAt: v.pipe(v.string(), v.minLength(1)),
  detail: v.record(v.string(), v.unknown()),
});

export const snapshotSourceHealthSchema = v.object({
  schemaVersion: v.literal(SNAPSHOT_TREE_SCHEMA_VERSION),
  generatedAt: v.pipe(v.string(), v.minLength(1)),
  regionCode: v.pipe(v.string(), v.minLength(1)),
  teamCount: v.pipe(v.number(), v.minValue(0)),
  sourceChecks: v.array(
    v.object({
      label: v.string(),
      url: v.string(),
      checkedAt: v.pipe(v.string(), v.minLength(1)),
      ok: v.boolean(),
      detail: v.optional(v.string()),
    }),
  ),
});

export type SnapshotParseIssue = { path: string; message: string };

function issuePath(issue: v.BaseIssue<unknown>): string {
  const suffix = (issue.path ?? [])
    .map((item) => (typeof item.key === 'number' ? `[${item.key}]` : `.${String(item.key)}`))
    .join('');
  return suffix.replace(/^\./, '') || '(root)';
}

function parseWithSchema<T>(
  schema: v.GenericSchema<unknown, T>,
  raw: unknown,
): { ok: true; data: T } | { ok: false; issues: SnapshotParseIssue[] } {
  const parsed = v.safeParse(schema, raw);
  if (parsed.success) {
    return { ok: true, data: parsed.output };
  }
  return {
    ok: false,
    issues: parsed.issues.map((issue) => ({
      path: issuePath(issue),
      message: issue.message,
    })),
  };
}

export function parseSnapshotManifest(raw: unknown) {
  return parseWithSchema(snapshotManifestSchema, raw);
}

export function parseRegionSeasonSummary(raw: unknown) {
  return parseWithSchema(regionSeasonSummarySchema, raw);
}

export function parseTeamSnapshotIndex(raw: unknown) {
  return parseWithSchema(teamSnapshotIndexSchema, raw);
}

export function parseTeamSeasonSnapshot(raw: unknown) {
  return parseWithSchema(teamSeasonSnapshotSchema, raw);
}

export function parseSnapshotSourceHealth(raw: unknown) {
  return parseWithSchema(snapshotSourceHealthSchema, raw);
}

/** Stable URL templates documented in the manifest. */
export const SNAPSHOT_PATH_TEMPLATES = {
  megaSeed: '/data/nv-ftc-teams.generated.json',
  observations: '/data/nv-ftc-team-observations.generated.json',
  sourceHealth: '/data/source-health.json',
  regionSummary: '/data/regions/{region}/{season}/summary.json',
  teamIndex: '/data/teams/{number}/index.json',
  teamSeason: '/data/teams/{number}/{season}.json',
} as const;

export function regionSummaryPath(regionCode: string, season: SeasonId): string {
  return `/data/regions/${regionCode}/${season}/summary.json`;
}

export function teamIndexPath(teamNumber: number): string {
  return `/data/teams/${teamNumber}/index.json`;
}

export function teamSeasonPath(teamNumber: number, season: SeasonId): string {
  return `/data/teams/${teamNumber}/${season}.json`;
}

export function isHistoricalSeason(season: SeasonId, currentSeason: SeasonId = CURRENT_SEASON): boolean {
  return season !== currentSeason;
}
