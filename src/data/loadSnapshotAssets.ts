/**
 * Fetch + validate snapshot-tree assets (#88).
 * Prefer these over the mega-seed for directory boot and lazy team detail.
 */
import { parseTeamSeasonDetail, type SeedIssue } from './generatedSeedSchema';
import { loadSnapshotManifest, type LoadSnapshotManifestResult } from './loadSnapshotManifest';
import type { SeasonId, TeamSeason } from './schema';
import {
  parseRegionSeasonSummary,
  parseTeamSeasonSnapshot,
  parseTeamSnapshotIndex,
  regionSummaryPath,
  teamIndexPath,
  teamSeasonPath,
  type RegionSeasonSummary,
  type SnapshotManifest,
  type SnapshotParseIssue,
  type TeamSnapshotIndex,
} from './snapshotTreeSchema';

export type LoadSnapshotAssetFailure = {
  ok: false;
  kind: 'network' | 'invalid-json' | 'invalid-envelope';
  message: string;
  issues?: SnapshotParseIssue[] | SeedIssue[];
  diagnostics?: string;
};

function isLikelyOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

async function fetchJson(
  url: string,
  fetchImpl: typeof fetch,
  label: string,
): Promise<{ ok: true; raw: unknown } | LoadSnapshotAssetFailure> {
  let response: Response;

  try {
    response = await fetchImpl(url);
  } catch (error) {
    return {
      ok: false,
      kind: 'network',
      message: isLikelyOffline()
        ? `You appear to be offline, so ${label} could not be loaded.`
        : `Could not download ${label}.`,
      diagnostics: error instanceof Error ? error.message : String(error),
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      kind: 'network',
      message: isLikelyOffline()
        ? `You appear to be offline, so ${label} could not be loaded.`
        : `Could not download ${label} (HTTP ${response.status}).`,
      diagnostics: `GET ${url} → ${response.status} ${response.statusText}`,
    };
  }

  try {
    return { ok: true, raw: await response.json() };
  } catch (error) {
    return {
      ok: false,
      kind: 'invalid-json',
      message: `${label} response was not valid JSON.`,
      diagnostics: error instanceof Error ? error.message : String(error),
    };
  }
}

export type LoadRegionSeasonSummaryResult =
  | { ok: true; data: RegionSeasonSummary }
  | LoadSnapshotAssetFailure;

export async function loadRegionSeasonSummary(
  regionCode: string,
  season: SeasonId,
  fetchImpl: typeof fetch = fetch,
  url: string = regionSummaryPath(regionCode, season),
): Promise<LoadRegionSeasonSummaryResult> {
  const fetched = await fetchJson(url, fetchImpl, `the ${season} region summary`);
  if (!fetched.ok) {
    return fetched;
  }

  const parsed = parseRegionSeasonSummary(fetched.raw);
  if (!parsed.ok) {
    return {
      ok: false,
      kind: 'invalid-envelope',
      message: `The ${season} region summary failed validation.`,
      issues: parsed.issues,
    };
  }

  return { ok: true, data: parsed.data };
}

export type LoadTeamSnapshotIndexResult =
  | { ok: true; data: TeamSnapshotIndex }
  | LoadSnapshotAssetFailure;

export async function loadTeamSnapshotIndex(
  teamNumber: number,
  fetchImpl: typeof fetch = fetch,
  url: string = teamIndexPath(teamNumber),
): Promise<LoadTeamSnapshotIndexResult> {
  const fetched = await fetchJson(url, fetchImpl, `team ${teamNumber} index`);
  if (!fetched.ok) {
    return fetched;
  }

  const parsed = parseTeamSnapshotIndex(fetched.raw);
  if (!parsed.ok) {
    return {
      ok: false,
      kind: 'invalid-envelope',
      message: `Team ${teamNumber} index failed validation.`,
      issues: parsed.issues,
    };
  }

  return { ok: true, data: parsed.data };
}

export type LoadTeamSeasonDetailResult =
  | { ok: true; data: TeamSeason; generatedAt: string }
  | LoadSnapshotAssetFailure;

export async function loadTeamSeasonDetail(
  teamNumber: number,
  season: SeasonId,
  fetchImpl: typeof fetch = fetch,
  url: string = teamSeasonPath(teamNumber, season),
): Promise<LoadTeamSeasonDetailResult> {
  const fetched = await fetchJson(url, fetchImpl, `team ${teamNumber} (${season}) detail`);
  if (!fetched.ok) {
    return fetched;
  }

  const envelope = parseTeamSeasonSnapshot(fetched.raw);
  if (!envelope.ok) {
    return {
      ok: false,
      kind: 'invalid-envelope',
      message: `Team ${teamNumber} (${season}) snapshot failed validation.`,
      issues: envelope.issues,
    };
  }

  const detail = parseTeamSeasonDetail(envelope.data.detail);
  if (!detail.ok) {
    return {
      ok: false,
      kind: 'invalid-envelope',
      message: `Team ${teamNumber} (${season}) detail failed validation.`,
      issues: detail.issues,
    };
  }

  return { ok: true, data: detail.data, generatedAt: envelope.data.generatedAt };
}

export type LoadTreeDirectoryResult =
  | {
      ok: true;
      manifest: SnapshotManifest;
      summaries: RegionSeasonSummary[];
      warnings: string[];
    }
  | LoadSnapshotAssetFailure
  | Extract<LoadSnapshotManifestResult, { ok: false }>;

/**
 * Load manifest + all listed region summaries (small files). Does not fetch team detail.
 */
export async function loadTreeDirectoryAssets(
  fetchImpl: typeof fetch = fetch,
): Promise<LoadTreeDirectoryResult> {
  const manifestResult = await loadSnapshotManifest(undefined, fetchImpl);
  if (!manifestResult.ok) {
    return manifestResult;
  }

  const manifest = manifestResult.data;
  const summaryResults = await Promise.all(
    manifest.seasons.map((season) => loadRegionSeasonSummary(manifest.regionCode, season, fetchImpl)),
  );

  const summaries: RegionSeasonSummary[] = [];
  const warnings: string[] = [];

  summaryResults.forEach((result, index) => {
    const season = manifest.seasons[index];
    if (result.ok) {
      summaries.push(result.data);
      return;
    }
    warnings.push(
      result.kind === 'network'
        ? `Region summary for ${season} was unavailable (${result.message}).`
        : `Region summary for ${season} was invalid.`,
    );
  });

  if (summaries.length === 0) {
    return {
      ok: false,
      kind: 'network',
      message: 'Snapshot tree manifest loaded, but no region summaries were available.',
      diagnostics: warnings.join(' '),
    };
  }

  return { ok: true, manifest, summaries, warnings };
}
