/**
 * Offline backfill: derive TeamSeason.affiliations from existing organization
 * strings in the checked-in Nevada seed. No network access.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseOrganizationAffiliations } from '../src/lib/organizationAffiliations.ts';
import type { GeneratedData, SeasonId, Team, TeamSeason } from '../src/data/schema.ts';

const SEED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/nv-ftc-teams.generated.json');

const data = JSON.parse(readFileSync(SEED_PATH, 'utf8')) as GeneratedData;
let seasonsTouched = 0;
let affiliationsWritten = 0;

const teams: Team[] = data.teams.map((team) => {
  const seasons: Team['seasons'] = { ...team.seasons };

  for (const [key, season] of Object.entries(seasons)) {
    if (!season) continue;
    const typed = season as TeamSeason;
    if (!typed.organization) {
      seasons[key as `${SeasonId}`] = { ...typed, affiliations: typed.affiliations ?? [] };
      continue;
    }
    const affiliations = parseOrganizationAffiliations(typed.organization, {
      season: typed.season,
      source: 'organization-backfill',
      retrievedAt: null,
    });
    seasons[key as `${SeasonId}`] = { ...typed, affiliations };
    seasonsTouched += 1;
    affiliationsWritten += affiliations.length;
  }

  return { ...team, seasons };
});

const limitations = [...(data.limitations ?? [])];
const affiliationNote =
  'Organization strings are also split into typed affiliations (school, sponsors, community/host) with confidence flags; the raw organization text is retained. Ambiguous parses stay unconfirmed/low confidence.';
if (!limitations.some((line) => line.includes('typed affiliations'))) {
  const orgIdx = limitations.findIndex((line) => line.toLowerCase().includes('organization is parsed'));
  if (orgIdx >= 0) {
    limitations.splice(orgIdx + 1, 0, affiliationNote);
  } else {
    limitations.push(affiliationNote);
  }
}

const next: GeneratedData = {
  ...data,
  teams,
  limitations,
};

writeFileSync(SEED_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
console.log(`Backfilled ${seasonsTouched} seasons (${affiliationsWritten} affiliation rows) -> ${SEED_PATH}`);
