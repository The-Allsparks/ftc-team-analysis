import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { assertSafeToPublishGeneratedData, PUBLISH_GUARD_EMPTY } from './publishGuard';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SEED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'nv-ftc-teams.generated.json');
const EMPTY_FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/empty-generated-candidate.json');

describe('empty candidate fixture publish gate', () => {
  it('rejects the deliberately empty fixture against the checked-in seed', () => {
    const previous = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
    const candidate = JSON.parse(readFileSync(EMPTY_FIXTURE, 'utf8'));
    expect(() => assertSafeToPublishGeneratedData(previous, candidate)).toThrow(PUBLISH_GUARD_EMPTY);
  });

  it('documents the fixture path used by pull:data --candidate-fixture dry gates', () => {
    expect(EMPTY_FIXTURE.startsWith(ROOT)).toBe(true);
  });
});
