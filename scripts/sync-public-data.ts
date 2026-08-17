/**
 * Copy canonical Nevada seed + observation side store into public/data/
 * and generate the split snapshot tree (#87) so Vite serves them as static
 * assets (not compiled into the JS bundle).
 */
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGeneratedSeed } from '../src/data/generatedSeedSchema';
import { formatSizeComparisonMarkdown } from '../src/data/snapshotTree';
import { writeSnapshotTree } from './snapshotTreeWrite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDataDir = resolve(root, 'public/data');

const assets = [
  {
    source: resolve(root, 'src/data/nv-ftc-teams.generated.json'),
    target: resolve(root, 'public/data/nv-ftc-teams.generated.json'),
  },
  {
    source: resolve(root, 'src/data/nv-ftc-team-observations.generated.json'),
    target: resolve(root, 'public/data/nv-ftc-team-observations.generated.json'),
  },
] as const;

await mkdir(publicDataDir, { recursive: true });

for (const asset of assets) {
  try {
    await copyFile(asset.source, asset.target);
    console.log(`Synced ${asset.source} → ${asset.target}`);
  } catch (error) {
    if (asset.source.includes('observations')) {
      console.warn(`Skipped observations sync (missing source): ${asset.source}`);
      continue;
    }
    throw error;
  }
}

const seedRaw = JSON.parse(await readFile(assets[0].source, 'utf8')) as unknown;
const parsed = parseGeneratedSeed(seedRaw);

if (!parsed.ok) {
  console.error('Refusing to generate snapshot tree: mega-seed envelope is invalid.');
  for (const issue of parsed.issues) {
    console.error(`  ${issue.path}: ${issue.message}`);
  }
  process.exit(1);
}

const built = await writeSnapshotTree(publicDataDir, parsed.data, { previous: seedRaw });
console.log(
  `Wrote snapshot tree (${built.fileCount} files) for ${built.manifest.teamCount} teams / ${built.manifest.seasons.length} seasons.`,
);
console.log(formatSizeComparisonMarkdown(built.sizes, built.manifest.teamCount, built.manifest.generatedAt));
