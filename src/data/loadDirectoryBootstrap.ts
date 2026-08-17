/**
 * Static-first directory bootstrap (#88).
 * Prefer snapshot tree (manifest + region summaries); fall soft to mega-seed.
 */
import { loadGeneratedSeed, type LoadGeneratedSeedResult } from './loadGeneratedSeed';
import { loadTreeDirectoryAssets } from './loadSnapshotAssets';
import { loadTeamObservations } from './loadTeamObservations';
import type { GeneratedData } from './schema';
import {
  buildDirectoryDataFromTree,
  type DirectorySnapshotSource,
} from './snapshotDirectory';
import { attachObservationsToData } from '../lib/teamObservations';
import type { SeedIssue } from './generatedSeedSchema';

export type DirectoryBootstrapResult =
  | {
      ok: true;
      data: GeneratedData;
      source: DirectorySnapshotSource;
      warnings: string[];
      quarantined: SeedIssue[];
    }
  | {
      ok: false;
      kind: 'network' | 'invalid-json' | 'invalid-envelope';
      message: string;
      issues?: SeedIssue[];
      diagnostics?: string;
    };

function failureFromSeed(result: Extract<LoadGeneratedSeedResult, { ok: false }>): Extract<
  DirectoryBootstrapResult,
  { ok: false }
> {
  return {
    ok: false,
    kind: result.kind,
    message: result.message,
    issues: result.issues,
    diagnostics: result.diagnostics,
  };
}

async function attachObservations(
  data: GeneratedData,
  fetchImpl: typeof fetch,
): Promise<{ data: GeneratedData; warnings: string[] }> {
  const observationsResult = await loadTeamObservations(undefined, fetchImpl, data.regionCode);
  if (!observationsResult.ok) {
    return {
      data,
      warnings: [`Observations side store unavailable: ${observationsResult.message}`],
    };
  }

  if (observationsResult.quarantined.length > 0) {
    console.warn('[observations] quarantined invalid records', observationsResult.quarantined);
  }

  return {
    data: attachObservationsToData(data, observationsResult.data),
    warnings: [],
  };
}

/**
 * Boot the directory from the static snapshot tree when present; otherwise mega-seed.
 * Never bundles seed JSON into the JS graph — all assets are fetched at runtime.
 */
export async function loadDirectoryBootstrap(
  fetchImpl: typeof fetch = fetch,
): Promise<DirectoryBootstrapResult> {
  const tree = await loadTreeDirectoryAssets(fetchImpl);
  const warnings: string[] = [];

  if (tree.ok) {
    warnings.push(...tree.warnings);
    let data = buildDirectoryDataFromTree(tree.manifest, tree.summaries);
    const withObs = await attachObservations(data, fetchImpl);
    data = withObs.data;
    warnings.push(...withObs.warnings);

    return {
      ok: true,
      data,
      source: 'tree',
      warnings,
      quarantined: [],
    };
  }

  warnings.push(
    tree.kind === 'network'
      ? `Snapshot tree unavailable (${tree.message}); falling back to mega-seed.`
      : `Snapshot tree invalid (${tree.message}); falling back to mega-seed.`,
  );
  if (tree.diagnostics) {
    console.warn('[snapshot-tree]', tree.message, tree.diagnostics);
  } else {
    console.warn('[snapshot-tree]', tree.message);
  }

  const seedResult = await loadGeneratedSeed(undefined, fetchImpl);
  if (!seedResult.ok) {
    return failureFromSeed(seedResult);
  }

  if (seedResult.quarantined.length > 0) {
    console.warn('[generated-seed] quarantined invalid records', seedResult.quarantined);
  }

  let data = seedResult.data;
  const withObs = await attachObservations(data, fetchImpl);
  data = withObs.data;
  warnings.push(...withObs.warnings);

  return {
    ok: true,
    data,
    source: 'mega-seed',
    warnings,
    quarantined: seedResult.quarantined,
  };
}
