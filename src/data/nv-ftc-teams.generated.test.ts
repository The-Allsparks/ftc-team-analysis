import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseGeneratedSeed } from './generatedSeedSchema';

const SEED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'nv-ftc-teams.generated.json');

describe('checked-in Nevada seed', () => {
  it('parses as a GeneratedData-shaped object with teams', () => {
    const raw: unknown = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
    const result = parseGeneratedSeed(raw);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.quarantined).toEqual([]);
    expect(result.data.generatedAt.length).toBeGreaterThan(0);
    expect(result.data.targetSeasons.length).toBeGreaterThan(0);
    expect(result.data.teams.length).toBeGreaterThan(0);

    for (const team of result.data.teams) {
      expect(typeof team.number).toBe('number');
      expect(Object.keys(team.seasons).length).toBeGreaterThan(0);
    }
  });
});
