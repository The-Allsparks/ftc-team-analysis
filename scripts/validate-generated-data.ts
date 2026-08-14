import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENERATED_DATA_SCHEMA_VERSION, parseGeneratedSeed } from '../src/data/generatedSeedSchema';

const seedPath = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/nv-ftc-teams.generated.json');
const result = parseGeneratedSeed(JSON.parse(readFileSync(seedPath, 'utf8')));

if (!result.ok) {
  console.error('Generated seed envelope is invalid:');
  for (const issue of result.issues) {
    const team = issue.teamNumber !== undefined ? ` (team ${issue.teamNumber})` : '';
    console.error(`  ${issue.path}: ${issue.message}${team}`);
  }
  process.exit(1);
}

if (result.quarantined.length > 0) {
  console.warn(`Quarantined ${result.quarantined.length} record(s):`);
  for (const issue of result.quarantined) {
    const team = issue.teamNumber !== undefined ? ` (team ${issue.teamNumber})` : '';
    console.warn(`  ${issue.path}: ${issue.message}${team}`);
  }
}

console.log(
  `OK: ${result.data.teams.length} teams (schemaVersion ${result.data.schemaVersion ?? GENERATED_DATA_SCHEMA_VERSION})`,
);
