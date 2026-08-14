import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PULL_SCRIPT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../scripts/pull-public-ftc-data.ts',
);

describe('pull-public-ftc-data publish wiring', () => {
  it('calls the publish guard before writeFile', () => {
    const source = readFileSync(PULL_SCRIPT_PATH, 'utf8');
    const importIdx = source.indexOf("from '../src/data/publishGuard'");
    const guardIdx = source.indexOf('assertSafeToPublishGeneratedData(');
    const writeIdx = source.indexOf('writeFile(GENERATED_PATH');

    expect(importIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(-1);
    expect(writeIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(writeIdx);
  });
});
