/**
 * Offline backfill: synthesize TeamSeason.evidence from existing season scalars
 * and sourceUrl. No network access. Does not modify affiliations (#4).
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

const limitations = [...(data.limitations ?? [])];
const evidenceNote =
  'Core season facts (name, location, organization, website, records, and related fields) carry optional per-field evidence (source type/URL, retrieval time, confidence, conflict/supersede status). Team.latest* fields remain derived profile projections. Organization affiliations stay a parallel model.';
if (!limitations.some((line) => line.toLowerCase().includes('per-field evidence'))) {
  const orgIdx = limitations.findIndex((line) => line.toLowerCase().includes('typed affiliations'));
  if (orgIdx >= 0) {
    limitations.splice(orgIdx + 1, 0, evidenceNote);
  } else {
    limitations.push(evidenceNote);
  }
}

const next: GeneratedData = {
  ...data,
  teams,
  limitations,
};

writeFileSync(SEED_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
console.log(`Backfilled evidence on ${seasonsTouched} seasons (${evidenceRows} evidence rows) -> ${SEED_PATH}`);
