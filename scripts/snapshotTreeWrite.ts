/**
 * Node-only write + size re-measure for the snapshot tree (#87).
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { assertSafeToPublishGeneratedData } from '../src/data/publishGuard';
import type { GeneratedData } from '../src/data/schema';
import { CURRENT_SEASON } from '../src/data/seasons';
import {
  buildSnapshotTree,
  formatSizeLabel,
  type SnapshotTreeBuildResult,
  type SnapshotTreeSizeRow,
} from '../src/data/snapshotTree';

function jsonBytes(value: unknown): { formatted: number; minified: number; minifiedGzip: number } {
  const formatted = Buffer.byteLength(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  const minifiedText = JSON.stringify(value);
  const minified = Buffer.byteLength(minifiedText, 'utf8');
  const minifiedGzip = gzipSync(Buffer.from(minifiedText, 'utf8'), { level: 9 }).length;
  return { formatted, minified, minifiedGzip };
}

export function measureSnapshotTreeSizes(
  data: GeneratedData,
  built: SnapshotTreeBuildResult,
): SnapshotTreeSizeRow[] {
  const mega = jsonBytes(data);
  const primarySummary =
    [...built.regionSummaries].sort((a, b) => b.teamCount - a.teamCount)[0] ??
    built.regionSummaries.find((row) => row.season === CURRENT_SEASON) ??
    built.regionSummaries[0];
  const summaryGzip = primarySummary ? jsonBytes(primarySummary).minifiedGzip : 0;

  const teamGzipSamples = built.teamSeasons.map((row) => jsonBytes(row).minifiedGzip);
  const avgTeamGzip =
    teamGzipSamples.length === 0
      ? 0
      : Math.round(teamGzipSamples.reduce((sum, n) => sum + n, 0) / teamGzipSamples.length);

  return [
    {
      form: 'Formatted mega-seed JSON on disk',
      bytes: mega.formatted,
      label: formatSizeLabel(mega.formatted),
    },
    {
      form: 'Minified mega-seed JSON',
      bytes: mega.minified,
      label: formatSizeLabel(mega.minified),
    },
    {
      form: 'gzip of minified mega-seed (zlib level 9)',
      bytes: mega.minifiedGzip,
      label: formatSizeLabel(mega.minifiedGzip),
    },
    {
      form: `Lightweight region summary gzip (${primarySummary?.season ?? 'n/a'})`,
      bytes: summaryGzip,
      label: formatSizeLabel(summaryGzip),
    },
    {
      form: 'Average individual team-season snapshot gzip',
      bytes: avgTeamGzip,
      label: formatSizeLabel(avgTeamGzip),
    },
  ];
}

async function emptyDir(path: string): Promise<void> {
  try {
    await rm(path, { recursive: true, force: true });
  } catch {
    // missing is fine
  }
  await mkdir(path, { recursive: true });
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value)}\n`, 'utf8');
}

/**
 * Publish-guard-aware write of the snapshot tree under `publicDataDir`.
 * Refuses empty/invalid candidates the same way as mega-seed publication (#34).
 */
export async function writeSnapshotTree(
  publicDataDir: string,
  data: GeneratedData,
  options?: { previous?: unknown | null; treeGeneratedAt?: string },
): Promise<SnapshotTreeBuildResult & { sizes: SnapshotTreeSizeRow[] }> {
  assertSafeToPublishGeneratedData(options?.previous ?? null, data);

  const built = buildSnapshotTree(data, options?.treeGeneratedAt ?? new Date().toISOString());
  const sizes = measureSnapshotTreeSizes(data, built);
  const regionsRoot = resolve(publicDataDir, 'regions');
  const teamsRoot = resolve(publicDataDir, 'teams');

  await emptyDir(regionsRoot);
  await emptyDir(teamsRoot);
  await mkdir(publicDataDir, { recursive: true });

  await writeJson(resolve(publicDataDir, 'manifest.json'), built.manifest);
  await writeJson(resolve(publicDataDir, 'source-health.json'), built.sourceHealth);

  for (const summary of built.regionSummaries) {
    const path = resolve(
      publicDataDir,
      'regions',
      summary.regionCode,
      String(summary.season),
      'summary.json',
    );
    await writeJson(path, summary);
  }

  for (const index of built.teamIndexes) {
    await writeJson(resolve(publicDataDir, 'teams', String(index.number), 'index.json'), index);
  }

  for (const seasonFile of built.teamSeasons) {
    await writeJson(
      resolve(publicDataDir, 'teams', String(seasonFile.number), `${seasonFile.season}.json`),
      seasonFile,
    );
  }

  return { ...built, sizes };
}
