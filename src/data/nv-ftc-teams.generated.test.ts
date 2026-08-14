import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SEED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'nv-ftc-teams.generated.json');

describe('checked-in Nevada seed', () => {
  it('parses as a GeneratedData-shaped object with teams', () => {
    const raw = readFileSync(SEED_PATH, 'utf8');
    const data: unknown = JSON.parse(raw);

    expect(data).toBeTypeOf('object');
    expect(data).not.toBeNull();
    expect(Array.isArray(data)).toBe(false);

    const seed = data as {
      generatedAt?: unknown;
      targetSeasons?: unknown;
      teams?: unknown;
    };

    expect(typeof seed.generatedAt).toBe('string');
    expect((seed.generatedAt as string).length).toBeGreaterThan(0);
    expect(Array.isArray(seed.targetSeasons)).toBe(true);
    expect((seed.targetSeasons as unknown[]).length).toBeGreaterThan(0);
    expect(Array.isArray(seed.teams)).toBe(true);
    expect((seed.teams as unknown[]).length).toBeGreaterThan(0);

    for (const team of seed.teams as Array<{ number?: unknown; seasons?: unknown }>) {
      expect(typeof team.number).toBe('number');
      expect(team.seasons).toBeTypeOf('object');
      expect(team.seasons).not.toBeNull();
      expect(Object.keys(team.seasons as object).length).toBeGreaterThan(0);
    }
  });
});
