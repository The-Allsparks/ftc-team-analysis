/**
 * Runtime schema for checked-in region catalog (`regions.generated.json`).
 *
 * `REGION_CATALOG_SCHEMA_VERSION` is 1. The current catalog omits `schemaVersion`
 * and is treated as version 1. A present value other than 1 fails the envelope.
 *
 * Invalid region rows are quarantined; envelope / empty / all-quarantined failures
 * are hard parse failures for App fail-closed UI.
 */
import * as v from 'valibot';

export const REGION_CATALOG_SCHEMA_VERSION = 1;

const REGION_GROUPS = ['us', 'us-sub', 'canada', 'international'] as const;
type RegionGroup = (typeof REGION_GROUPS)[number];

type FtcRegion = {
  code: string;
  label: string;
  stateProv?: string;
  group: RegionGroup;
};

export const REGION_CATALOG_NOT_OBJECT = 'Region catalog is not an object with a regions array.';
export const REGION_CATALOG_EMPTY_REGIONS = 'Region catalog has an empty regions array.';

export function regionCatalogAllQuarantinedMessage(count: number): string {
  return `Region catalog has no valid regions; ${count} invalid region record(s) were quarantined.`;
}

export type RegionIssue = {
  path: string;
  message: string;
  code?: string;
};

export type RegionCatalogData = {
  generatedAt: string;
  season: number;
  schemaVersion?: number;
  regions: FtcRegion[];
};

export type ParseRegionCatalogResult =
  | { ok: true; data: RegionCatalogData; quarantined: RegionIssue[] }
  | { ok: false; kind: 'invalid-envelope'; issues: RegionIssue[] };

const regionGroupSchema = v.picklist(REGION_GROUPS);

const regionRowSchema = v.looseObject({
  code: v.pipe(v.string(), v.minLength(1)),
  label: v.pipe(v.string(), v.minLength(1)),
  stateProv: v.optional(v.string()),
  group: regionGroupSchema,
});

const envelopeSchema = v.looseObject({
  generatedAt: v.pipe(v.string(), v.minLength(1)),
  season: v.number(),
  schemaVersion: v.optional(
    v.literal(
      REGION_CATALOG_SCHEMA_VERSION,
      `Unsupported region-catalog schemaVersion; expected ${REGION_CATALOG_SCHEMA_VERSION}.`,
    ),
  ),
  regions: v.array(v.unknown()),
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function issuePath(issue: v.BaseIssue<unknown>, prefix = ''): string {
  const suffix = (issue.path ?? [])
    .map((item) => (typeof item.key === 'number' ? `[${item.key}]` : `.${String(item.key)}`))
    .join('');
  return `${prefix}${suffix}`.replace(/^\./, '') || '(root)';
}

function issuesFromValibot(
  issues: [v.BaseIssue<unknown>, ...v.BaseIssue<unknown>[]],
  prefix = '',
  code?: string,
): RegionIssue[] {
  return issues.map((issue) => ({
    path: issuePath(issue, prefix),
    message: issue.message,
    ...(code !== undefined ? { code } : {}),
  }));
}

function readRegionCode(value: unknown): string | undefined {
  if (!isPlainObject(value) || typeof value.code !== 'string' || value.code.length === 0) {
    return undefined;
  }
  return value.code;
}

export function parseRegionCatalog(raw: unknown): ParseRegionCatalogResult {
  if (!isPlainObject(raw) || !Array.isArray(raw.regions)) {
    return {
      ok: false,
      kind: 'invalid-envelope',
      issues: [{ path: isPlainObject(raw) ? 'regions' : '(root)', message: REGION_CATALOG_NOT_OBJECT }],
    };
  }

  const envelope = v.safeParse(envelopeSchema, raw);
  if (!envelope.success) {
    return {
      ok: false,
      kind: 'invalid-envelope',
      issues: issuesFromValibot(envelope.issues),
    };
  }

  if (envelope.output.regions.length === 0) {
    return {
      ok: false,
      kind: 'invalid-envelope',
      issues: [{ path: 'regions', message: REGION_CATALOG_EMPTY_REGIONS }],
    };
  }

  const quarantined: RegionIssue[] = [];
  const regions: FtcRegion[] = [];

  envelope.output.regions.forEach((region, index) => {
    const parsed = v.safeParse(regionRowSchema, region);
    const code = readRegionCode(region);
    if (parsed.success) {
      const row = parsed.output;
      regions.push({
        code: row.code,
        label: row.label,
        group: row.group,
        ...(row.stateProv !== undefined ? { stateProv: row.stateProv } : {}),
      });
      return;
    }
    quarantined.push(...issuesFromValibot(parsed.issues, `regions[${index}]`, code));
  });

  if (regions.length === 0) {
    return {
      ok: false,
      kind: 'invalid-envelope',
      issues: [
        {
          path: 'regions',
          message: regionCatalogAllQuarantinedMessage(envelope.output.regions.length),
        },
        ...quarantined,
      ],
    };
  }

  const data: RegionCatalogData = {
    generatedAt: envelope.output.generatedAt,
    season: envelope.output.season,
    ...(envelope.output.schemaVersion !== undefined
      ? { schemaVersion: envelope.output.schemaVersion }
      : {}),
    regions,
  };

  return { ok: true, data, quarantined };
}
