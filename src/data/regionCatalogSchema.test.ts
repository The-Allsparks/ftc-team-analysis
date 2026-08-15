import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  REGION_CATALOG_EMPTY_REGIONS,
  REGION_CATALOG_NOT_OBJECT,
  REGION_CATALOG_SCHEMA_VERSION,
  parseRegionCatalog,
  regionCatalogAllQuarantinedMessage,
} from './regionCatalogSchema';

const CATALOG_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'regions.generated.json');

const validRegion = {
  code: 'USNV',
  label: 'Nevada',
  stateProv: 'NV',
  group: 'us' as const,
};

function validCatalog() {
  return {
    generatedAt: '2025-07-15',
    season: 2025,
    regions: [
      structuredClone(validRegion),
      {
        code: 'CABC',
        label: 'British Columbia',
        group: 'canada' as const,
      },
      {
        code: 'USCALA',
        label: 'California - Los Angeles',
        group: 'us-sub' as const,
      },
      {
        code: 'AU',
        label: 'Australia',
        group: 'international' as const,
        extra: true,
      },
    ],
  };
}

describe('parseRegionCatalog', () => {
  it('accepts a valid in-memory fixture and ignores unknown fields', () => {
    const result = parseRegionCatalog(validCatalog());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.quarantined).toEqual([]);
    expect(result.data.regions).toHaveLength(4);
    expect(result.data.regions[0]).toEqual(validRegion);
    expect(result.data.schemaVersion).toBeUndefined();
  });

  it('accepts the checked-in region catalog without rewriting it', () => {
    const raw: unknown = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
    const result = parseRegionCatalog(raw);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.quarantined).toEqual([]);
    expect(result.data.regions.length).toBe(78);
    expect(result.data.regions.some((region) => region.code === 'USNV')).toBe(true);
  });

  it('quarantines one invalid region and keeps the rest', () => {
    const fixture = validCatalog();
    (fixture.regions[1] as { label: unknown }).label = 123;

    const result = parseRegionCatalog(fixture);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.regions).toHaveLength(3);
    expect(result.data.regions.some((region) => region.code === 'CABC')).toBe(false);
    expect(result.quarantined.length).toBeGreaterThan(0);
    expect(result.quarantined.some((issue) => issue.code === 'CABC')).toBe(true);
    expect(result.quarantined.some((issue) => issue.path.includes('regions[1]'))).toBe(true);
  });

  it('fails closed when the envelope is not an object or regions is missing', () => {
    expect(parseRegionCatalog(null)).toEqual({
      ok: false,
      kind: 'invalid-envelope',
      issues: [{ path: '(root)', message: REGION_CATALOG_NOT_OBJECT }],
    });
    expect(parseRegionCatalog([])).toEqual({
      ok: false,
      kind: 'invalid-envelope',
      issues: [{ path: '(root)', message: REGION_CATALOG_NOT_OBJECT }],
    });
    expect(parseRegionCatalog({ generatedAt: '2025-07-15', season: 2025 })).toEqual({
      ok: false,
      kind: 'invalid-envelope',
      issues: [{ path: 'regions', message: REGION_CATALOG_NOT_OBJECT }],
    });
  });

  it('fails closed on an empty regions array', () => {
    const fixture = validCatalog();
    fixture.regions = [];

    expect(parseRegionCatalog(fixture)).toEqual({
      ok: false,
      kind: 'invalid-envelope',
      issues: [{ path: 'regions', message: REGION_CATALOG_EMPTY_REGIONS }],
    });
  });

  it('fails closed when every region is quarantined', () => {
    const fixture = validCatalog();
    (fixture.regions[0] as { group: unknown }).group = 'moon';
    (fixture.regions[1] as { code: unknown }).code = '';
    (fixture.regions[2] as { label: unknown }).label = '';
    (fixture.regions[3] as { group: unknown }).group = 'planet';

    const result = parseRegionCatalog(fixture);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.kind).toBe('invalid-envelope');
    expect(result.issues[0]).toEqual({
      path: 'regions',
      message: regionCatalogAllQuarantinedMessage(4),
    });
    expect(result.issues.some((issue) => issue.path.includes('regions[0]'))).toBe(true);
  });

  it('fails closed on an unsupported schemaVersion', () => {
    const fixture = { ...validCatalog(), schemaVersion: 999 };
    const result = parseRegionCatalog(fixture);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.kind).toBe('invalid-envelope');
    expect(result.issues.some((issue) => issue.path.includes('schemaVersion'))).toBe(true);
  });

  it('accepts schemaVersion 1 when present', () => {
    const result = parseRegionCatalog({
      ...validCatalog(),
      schemaVersion: REGION_CATALOG_SCHEMA_VERSION,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.schemaVersion).toBe(REGION_CATALOG_SCHEMA_VERSION);
  });
});
