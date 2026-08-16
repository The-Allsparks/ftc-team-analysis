/**
 * One-shot: migrate any seed-embedded evidence into the observations side store,
 * synthesize baselines for seasons without history, strip evidence from the mega seed.
 * Safe to re-run; does not hit the network.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GeneratedData } from '../src/data/schema';
import { parseTeamObservations } from '../src/data/teamObservationsSchema';
import {
  emptyTeamObservations,
  migrateEmbeddedEvidenceToStore,
} from '../src/lib/teamObservations';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const seedPath = resolve(root, 'src/data/nv-ftc-teams.generated.json');
const observationsPath = resolve(root, 'src/data/nv-ftc-team-observations.generated.json');

const seed = JSON.parse(await readFile(seedPath, 'utf8')) as GeneratedData;

let store = emptyTeamObservations(seed.regionCode || 'USNV', seed.generatedAt);
try {
  const raw = JSON.parse(await readFile(observationsPath, 'utf8')) as unknown;
  const parsed = parseTeamObservations(raw);
  if (parsed.ok) {
    store = parsed.data;
  }
} catch {
  // First run.
}

const migrated = migrateEmbeddedEvidenceToStore(seed, store);

await writeFile(seedPath, `${JSON.stringify(migrated.data, null, 2)}\n`, 'utf8');
await writeFile(observationsPath, `${JSON.stringify(migrated.store, null, 2)}\n`, 'utf8');

console.log(
  `Migrated: ${migrated.store.observations.length} observation rows; seed evidence stripped.`,
);
