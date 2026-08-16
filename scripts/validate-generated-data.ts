import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENERATED_DATA_SCHEMA_VERSION, parseGeneratedSeed } from '../src/data/generatedSeedSchema';
import { parseTeamObservations } from '../src/data/teamObservationsSchema';
import { TEAM_OBSERVATIONS_SCHEMA_VERSION } from '../src/lib/teamObservations';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const seedPath = resolve(root, 'src/data/nv-ftc-teams.generated.json');
const observationsPath = resolve(root, 'src/data/nv-ftc-team-observations.generated.json');

const seedResult = parseGeneratedSeed(JSON.parse(readFileSync(seedPath, 'utf8')));

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
