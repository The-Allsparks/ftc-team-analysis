/**
 * OPTIONAL maintainer utility: persist synthesized TeamSeason.evidence into a
 * local seed copy. Do NOT run this to rewrite the checked-in Nevada seed in PRs —
 * it inflates the Vite bundle (~2×). Prefer derive-on-read (`evidenceForSeason`)
 * for display, and let live refresh / `pull:data` write evidence going forward.
 *
 * Usage (local only): npx tsx scripts/backfill-field-evidence.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachSynthesizedEvidence } from '../src/lib/fieldEvidence.ts';
import type { GeneratedData, SeasonId, Team, TeamSeason } from '../src/data/schema.ts';

const SEED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/nv-ftc-teams.generated.json');

const data = JSON.parse(readFileSync(SEED_PATH, 'utf8')) as GeneratedData;
let seasonsTouched = 0;
let evidenceRows = 0;

const teams: Team[] = data.teams.map((team) => {
  const seasons: Team['seasons'] = { ...team.seasons };

  for (const [key, season] of Object.entries(seasons)) {
    if (!season) continue;
    const typed = season as TeamSeason;
    if (typed.evidence && typed.evidence.length > 0) {
      continue;
    }
    const next = attachSynthesizedEvidence(typed, data.generatedAt ?? null);
    seasons[key as `${SeasonId}`] = next;
    seasonsTouched += 1;
    evidenceRows += next.evidence?.length ?? 0;
  }

  return { ...team, seasons };
});

const next: GeneratedData = {
  ...data,
  teams,
};

writeFileSync(SEED_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
console.log(
  `Backfilled evidence on ${seasonsTouched} seasons (${evidenceRows} evidence rows) -> ${SEED_PATH}`,
);
console.warn(
  'Warning: persisting evidence into the checked-in seed bloats the production JS bundle. Prefer evidenceForSeason derive-on-read; only keep this output for local experiments.',
);
