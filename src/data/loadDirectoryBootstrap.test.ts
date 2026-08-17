import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadRegionSeasonSummary,
  loadTeamSeasonDetail,
  loadTreeDirectoryAssets,
} from './loadSnapshotAssets';
import { loadDirectoryBootstrap } from './loadDirectoryBootstrap';
import { SNAPSHOT_MANIFEST_URL } from './loadSnapshotManifest';
import { GENERATED_SEED_URL } from './loadGeneratedSeed';
import { TEAM_OBSERVATIONS_URL } from '../lib/teamObservations';
import { parseGeneratedSeed } from './generatedSeedSchema';
import { isSummaryOnlySeason } from './snapshotDirectory';
import { buildSnapshotTree } from './snapshotTree';
import { regionSummaryPath, teamSeasonPath } from './snapshotTreeSchema';
import type { GeneratedData } from './schema';

const SEED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'nv-ftc-teams.generated.json');

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function loadSeed(): GeneratedData {
  const parsed = parseGeneratedSeed(JSON.parse(readFileSync(SEED_PATH, 'utf8')));
  if (!parsed.ok) {
    throw new Error('Fixture seed failed validation');
  }
  return parsed.data;
}

function treeFromSeed() {
  return buildSnapshotTree(loadSeed(), '2026-08-16T01:00:00.000Z');
}

describe('loadSnapshotAssets', () => {
  it('loads and validates a region summary fixture', async () => {
    const tree = treeFromSeed();
    const summary = tree.regionSummaries.find((row) => row.season === tree.manifest.currentSeason);
    expect(summary).toBeTruthy();
    const fetchImpl = vi.fn(async () => jsonResponse(summary));

    const result = await loadRegionSeasonSummary(
      tree.manifest.regionCode,
      tree.manifest.currentSeason,
      fetchImpl,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.season).toBe(tree.manifest.currentSeason);
    expect(result.data.teamCount).toBeGreaterThan(0);
  });

  it('loads team-season detail and validates the TeamSeason payload', async () => {
    const tree = treeFromSeed();
    const seasonFile = tree.teamSeasons.find((row) => row.number === 16158 && row.season === 2025);
    expect(seasonFile).toBeTruthy();
    const fetchImpl = vi.fn(async () => jsonResponse(seasonFile));

    const result = await loadTeamSeasonDetail(16158, 2025, fetchImpl);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.season).toBe(2025);
    expect(result.data.name.length).toBeGreaterThan(0);
    expect(Array.isArray(result.data.events)).toBe(true);
  });

  it('returns network failure for missing region summary', async () => {
    const fetchImpl = vi.fn(async () => new Response('missing', { status: 404, statusText: 'Not Found' }));
    const result = await loadRegionSeasonSummary('USNV', 2026, fetchImpl);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.kind).toBe('network');
  });
});

describe('loadTreeDirectoryAssets / loadDirectoryBootstrap', () => {
  it('boots the directory from manifest + summaries without team detail URLs', async () => {
    const tree = treeFromSeed();
    const summaryByPath = new Map(
      tree.regionSummaries.map((summary) => [regionSummaryPath(summary.regionCode, summary.season), summary]),
    );

    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === SNAPSHOT_MANIFEST_URL || url.endsWith('/manifest.json')) {
        return jsonResponse(tree.manifest);
      }
      const summary = summaryByPath.get(url);
      if (summary) {
        return jsonResponse(summary);
      }
      if (url.includes('observations')) {
        return jsonResponse({
          generatedAt: tree.manifest.generatedAt,
          schemaVersion: 1,
          regionCode: tree.manifest.regionCode,
          observations: [],
        });
      }
      throw new Error(`Unexpected fetch in tree-only boot: ${url}`);
    });

    const loaded = await loadTreeDirectoryAssets(fetchImpl);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) {
      return;
    }
    expect(loaded.summaries.length).toBe(tree.manifest.seasons.length);

    const boot = await loadDirectoryBootstrap(fetchImpl);
    expect(boot.ok).toBe(true);
    if (!boot.ok) {
      return;
    }
    expect(boot.source).toBe('tree');
    expect(boot.data.teams.length).toBeGreaterThan(0);
    expect(boot.data.teams.some((team) => isSummaryOnlySeason(Object.values(team.seasons)[0]))).toBe(true);

    const calledUrls = fetchImpl.mock.calls.map((call) => String(call[0]));
    expect(calledUrls.some((url) => /\/teams\/\d+\/\d+\.json$/.test(url))).toBe(false);
    expect(calledUrls.some((url) => url.includes(GENERATED_SEED_URL) || url.endsWith('nv-ftc-teams.generated.json'))).toBe(
      false,
    );
    // Sanity: tree includes team-season paths, but boot must not request them.
    expect(teamSeasonPath(16158, 2025)).toMatch(/\/teams\/16158\/2025\.json$/);
  });

  it('falls soft to mega-seed when the manifest is missing', async () => {
    const seed = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('manifest.json')) {
        return new Response('missing', { status: 404, statusText: 'Not Found' });
      }
      if (url.includes('nv-ftc-teams.generated.json') || url === GENERATED_SEED_URL) {
        return jsonResponse(seed);
      }
      if (url.includes('observations') || url === TEAM_OBSERVATIONS_URL) {
        return jsonResponse({
          generatedAt: seed.generatedAt,
          schemaVersion: 1,
          regionCode: seed.regionCode,
          observations: [],
        });
      }
      return new Response('missing', { status: 404 });
    });

    const boot = await loadDirectoryBootstrap(fetchImpl);
    expect(boot.ok).toBe(true);
    if (!boot.ok) {
      return;
    }
    expect(boot.source).toBe('mega-seed');
    expect(boot.warnings.some((warning) => /falling back to mega-seed/i.test(warning))).toBe(true);
    expect(boot.data.teams.length).toBeGreaterThan(0);
  });
});
