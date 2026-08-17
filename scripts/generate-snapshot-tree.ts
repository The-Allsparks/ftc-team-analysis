/**
 * Generate the static snapshot tree under public/data/ from the canonical mega-seed.
 * Same work as the tree step inside sync:data; useful for local re-runs.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGeneratedSeed } from '../src/data/generatedSeedSchema';
import { formatSizeComparisonMarkdown } from '../src/data/snapshotTree';
import { writeSnapshotTree } from './snapshotTreeWrite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const seedPath = resolve(root, 'src/data/nv-ftc-teams.generated.json');
const publicDataDir = resolve(root, 'public/data');

const raw = JSON.parse(readFileSync(seedPath, 'utf8')) as unknown;
const parsed = parseGeneratedSeed(raw);

if (!parsed.ok) {
  console.error('Refusing to generate snapshot tree: mega-seed envelope is invalid.');
  for (const issue of parsed.issues) {
    console.error(`  ${issue.path}: ${issue.message}`);
  }
  process.exit(1);
}

if (parsed.quarantined.length > 0) {
  console.warn(`Quarantined ${parsed.quarantined.length} seed record(s) before tree generation.`);
}

const built = await writeSnapshotTree(publicDataDir, parsed.data, { previous: raw });

console.log(
  `Wrote snapshot tree (${built.fileCount} files) under ${publicDataDir} for ${built.manifest.teamCount} teams / ${built.manifest.seasons.length} seasons.`,
);
console.log(formatSizeComparisonMarkdown(built.sizes, built.manifest.teamCount, built.manifest.generatedAt));
