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
import { isSummaryOnlySeason } from './snapshotDirectory';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicData = resolve(root, 'public/data');

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function readPublicJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(resolve(publicData, relativePath), 'utf8'));
}

describe('loadSnapshotAssets', () => {
  it('loads and validates a region summary fixture', async () => {
    const raw = readPublicJson('regions/USNV/2026/summary.json');
    const fetchImpl = vi.fn(async () => jsonResponse(raw));

    const result = await loadRegionSeasonSummary('USNV', 2026, fetchImpl);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.season).toBe(2026);
    expect(result.data.teamCount).toBeGreaterThan(0);
  });

  it('loads team-season detail and validates the TeamSeason payload', async () => {
    const raw = readPublicJson('teams/16158/2025.json');
    const fetchImpl = vi.fn(async () => jsonResponse(raw));

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
    const manifest = readPublicJson('manifest.json') as {
      seasons: number[];
      regionCode: string;
    };
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === SNAPSHOT_MANIFEST_URL || url.endsWith('/manifest.json')) {
        return jsonResponse(readPublicJson('manifest.json'));
      }
      const summaryMatch = url.match(/\/regions\/([^/]+)\/(\d+)\/summary\.json$/);
      if (summaryMatch) {
        return jsonResponse(readPublicJson(`regions/${summaryMatch[1]}/${summaryMatch[2]}/summary.json`));
      }
      if (url.includes('observations')) {
        return jsonResponse({
          generatedAt: '2026-08-16T00:00:00.000Z',
          schemaVersion: 1,
          regionCode: 'USNV',
          observations: [],
        });
      }
      throw new Error(`Unexpected fetch in tree-only boot: ${url}`);
    });

    const tree = await loadTreeDirectoryAssets(fetchImpl);
    expect(tree.ok).toBe(true);
    if (!tree.ok) {
      return;
    }
    expect(tree.summaries.length).toBe(manifest.seasons.length);

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
  });

  it('falls soft to mega-seed when the manifest is missing', async () => {
    const seed = JSON.parse(
      readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'nv-ftc-teams.generated.json'), 'utf8'),
    );
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
