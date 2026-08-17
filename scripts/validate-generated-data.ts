import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENERATED_DATA_SCHEMA_VERSION, parseGeneratedSeed } from '../src/data/generatedSeedSchema';
import { parseTeamObservations } from '../src/data/teamObservationsSchema';
import { TEAM_OBSERVATIONS_SCHEMA_VERSION } from '../src/lib/teamObservations';
import { formatSizeComparisonMarkdown } from '../src/data/snapshotTree';
import { writeSnapshotTree } from './snapshotTreeWrite';
import {
  parseRegionSeasonSummary,
  parseSnapshotManifest,
  parseSnapshotSourceHealth,
  parseTeamSeasonSnapshot,
  parseTeamSnapshotIndex,
} from '../src/data/snapshotTreeSchema';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const seedPath = resolve(root, 'src/data/nv-ftc-teams.generated.json');
const observationsPath = resolve(root, 'src/data/nv-ftc-team-observations.generated.json');
const publicDataDir = resolve(root, 'public/data');

const seedRaw = JSON.parse(readFileSync(seedPath, 'utf8')) as unknown;
const seedResult = parseGeneratedSeed(seedRaw);

if (!seedResult.ok) {
  console.error('Generated seed envelope is invalid:');
  for (const issue of seedResult.issues) {
    const team = issue.teamNumber !== undefined ? ` (team ${issue.teamNumber})` : '';
    console.error(`  ${issue.path}: ${issue.message}${team}`);
  }
  process.exit(1);
}

if (seedResult.quarantined.length > 0) {
  console.warn(`Quarantined ${seedResult.quarantined.length} seed record(s):`);
  for (const issue of seedResult.quarantined) {
    const team = issue.teamNumber !== undefined ? ` (team ${issue.teamNumber})` : '';
    console.warn(`  ${issue.path}: ${issue.message}${team}`);
  }
}

console.log(
  `OK: ${seedResult.data.teams.length} teams (schemaVersion ${seedResult.data.schemaVersion ?? GENERATED_DATA_SCHEMA_VERSION})`,
);

try {
  const observationsResult = parseTeamObservations(JSON.parse(readFileSync(observationsPath, 'utf8')));
  if (!observationsResult.ok) {
    console.error('Team observations envelope is invalid:');
    for (const issue of observationsResult.issues) {
      console.error(`  ${issue.path}: ${issue.message}`);
    }
    process.exit(1);
  }
  if (observationsResult.quarantined.length > 0) {
    console.warn(`Quarantined ${observationsResult.quarantined.length} observation record(s):`);
    for (const issue of observationsResult.quarantined) {
      console.warn(`  ${issue.path}: ${issue.message}`);
    }
  }
  console.log(
    `OK: ${observationsResult.data.observations.length} observations (schemaVersion ${observationsResult.data.schemaVersion ?? TEAM_OBSERVATIONS_SCHEMA_VERSION})`,
  );
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code === 'ENOENT') {
    console.warn(`Observations side store missing at ${observationsPath} (optional until first pull).`);
  } else {
    throw error;
  }
}

const built = await writeSnapshotTree(publicDataDir, seedResult.data, { previous: seedRaw });
console.log(`OK: regenerated snapshot tree (${built.fileCount} files) for validation`);
const sizeMarkdown = formatSizeComparisonMarkdown(
  built.sizes,
  built.manifest.teamCount,
  built.manifest.generatedAt,
);
console.log(sizeMarkdown);

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function failIssues(label: string, path: string, issues: { path: string; message: string }[]): never {
  console.error(`${label} invalid (${path}):`);
  for (const issue of issues) {
    console.error(`  ${issue.path}: ${issue.message}`);
  }
  process.exit(1);
}

const manifestPath = resolve(publicDataDir, 'manifest.json');
const manifestResult = parseSnapshotManifest(readJson(manifestPath));
if (!manifestResult.ok) {
  failIssues('manifest.json', manifestPath, manifestResult.issues);
}

const healthPath = resolve(publicDataDir, 'source-health.json');
const healthResult = parseSnapshotSourceHealth(readJson(healthPath));
if (!healthResult.ok) {
  failIssues('source-health.json', healthPath, healthResult.issues);
}

if (healthResult.data.generatedAt !== seedResult.data.generatedAt) {
  console.error(
    `source-health generatedAt ${healthResult.data.generatedAt} does not match seed ${seedResult.data.generatedAt}`,
  );
  process.exit(1);
}

if (healthResult.data.regionCode !== seedResult.data.regionCode) {
  console.error(
    `source-health regionCode ${healthResult.data.regionCode} does not match seed ${seedResult.data.regionCode}`,
  );
  process.exit(1);
}

if (healthResult.data.teamCount !== seedResult.data.teams.length) {
  console.error(
    `source-health teamCount ${healthResult.data.teamCount} does not match seed teams ${seedResult.data.teams.length}`,
  );
  process.exit(1);
}

const seedSourceChecks = seedResult.data.sourceChecks ?? [];
if (healthResult.data.sourceChecks.length !== seedSourceChecks.length) {
  console.error(
    `source-health sourceChecks length ${healthResult.data.sourceChecks.length} does not match seed ${seedSourceChecks.length}`,
  );
  process.exit(1);
}

const expectedFailures = seedSourceChecks.filter((check) => !check.ok).length;
if (healthResult.data.sourceCheckFailureCount !== expectedFailures) {
  console.error(
    `source-health sourceCheckFailureCount ${healthResult.data.sourceCheckFailureCount} does not match seed failures ${expectedFailures}`,
  );
  process.exit(1);
}

if (manifestResult.data.teamCount !== seedResult.data.teams.length) {
  console.error(
    `manifest teamCount ${manifestResult.data.teamCount} does not match seed teams ${seedResult.data.teams.length}`,
  );
  process.exit(1);
}

if (manifestResult.data.generatedAt !== seedResult.data.generatedAt) {
  console.error(
    `manifest generatedAt ${manifestResult.data.generatedAt} does not match seed ${seedResult.data.generatedAt}`,
  );
  process.exit(1);
}

let regionFiles = 0;
for (const season of manifestResult.data.seasons) {
  const summaryPath = resolve(
    publicDataDir,
    'regions',
    manifestResult.data.regionCode,
    String(season),
    'summary.json',
  );
  if (!existsSync(summaryPath)) {
    console.error(`Missing region summary: ${summaryPath}`);
    process.exit(1);
  }
  const summary = parseRegionSeasonSummary(readJson(summaryPath));
  if (!summary.ok) {
    failIssues('region summary', summaryPath, summary.issues);
  }
  regionFiles += 1;
}

let teamIndexFiles = 0;
let teamSeasonFiles = 0;
for (const entry of manifestResult.data.teams) {
  const indexPath = resolve(publicDataDir, 'teams', String(entry.number), 'index.json');
  if (!existsSync(indexPath)) {
    console.error(`Missing team index: ${indexPath}`);
    process.exit(1);
  }
  const index = parseTeamSnapshotIndex(readJson(indexPath));
  if (!index.ok) {
    failIssues('team index', indexPath, index.issues);
  }
  teamIndexFiles += 1;

  for (const season of index.data.seasons) {
    const seasonPath = resolve(publicDataDir, 'teams', String(entry.number), `${season}.json`);
    if (!existsSync(seasonPath)) {
      console.error(`Missing team season file: ${seasonPath}`);
      process.exit(1);
    }
    const seasonFile = parseTeamSeasonSnapshot(readJson(seasonPath));
    if (!seasonFile.ok) {
      failIssues('team season', seasonPath, seasonFile.issues);
    }
    teamSeasonFiles += 1;
  }
}

const teamsRoot = resolve(publicDataDir, 'teams');
if (existsSync(teamsRoot)) {
  const onDisk = new Set(
    readdirSync(teamsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  );
  const expected = new Set(manifestResult.data.teams.map((team) => String(team.number)));
  for (const name of onDisk) {
    if (!expected.has(name)) {
      console.error(`Unexpected team directory not listed in manifest: ${join(teamsRoot, name)}`);
      process.exit(1);
    }
  }
}

const treeSummary = `OK: snapshot tree (manifest + source-health + ${regionFiles} region summaries + ${teamIndexFiles} team indexes + ${teamSeasonFiles} team-season files)`;
console.log(treeSummary);

const reportPath = resolve(root, 'snapshot-tree-report.md');
writeFileSync(
  reportPath,
  [
    '# Snapshot tree validation report',
    '',
    `- ${treeSummary}`,
    `- Tree file count: **${built.fileCount}**`,
    `- Manifest \`generatedAt\`: \`${manifestResult.data.generatedAt}\``,
    `- Manifest \`treeGeneratedAt\`: \`${manifestResult.data.treeGeneratedAt}\``,
    `- Region: \`${manifestResult.data.regionCode}\` · current season: **${manifestResult.data.currentSeason}**`,
    '',
    'The split tree under `public/data/` is **gitignored** and regenerated from the canonical mega-seed by `pull:data` / `sync:data` / `validate:data` / `npm run build`. Data-refresh PRs commit seed + observations only; Pages/Worker builds emit the tree at deploy time.',
    '',
    sizeMarkdown,
  ].join('\n'),
  'utf8',
);
console.log(`Wrote ${reportPath}`);
