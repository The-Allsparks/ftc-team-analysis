/**
 * Aggregate school / community context guardrails (#27).
 *
 * Allowlisted institution- and geography-level fields only.
 * No live Census/NCES fetch pipeline here — see docs/school-community-context.md.
 */
import * as v from 'valibot';

export const AGGREGATE_SCHOOL_CONTEXT_SCHEMA_VERSION = 1 as const;

/** Geography kinds suitable for ACS / EDGE service-area joins (never student addresses). */
export const SERVICE_AREA_GEOGRAPHY_TYPES = [
  'school-district',
  'census-tract',
  'zcta',
  'county',
  'place',
] as const;

export type ServiceAreaGeographyType = (typeof SERVICE_AREA_GEOGRAPHY_TYPES)[number];

/**
 * Field names that must never appear on school/community context payloads.
 * Kept as an explicit deny list for tests and future ingestion checks.
 */
export const BANNED_SCHOOL_CONTEXT_FIELD_NAMES = [
  'studentId',
  'studentIds',
  'studentName',
  'studentNames',
  'students',
  'roster',
  'memberRoster',
  'email',
  'emails',
  'phone',
  'phones',
  'homeAddress',
  'homeAddresses',
  'birthDate',
  'birthDates',
  'ssn',
  'gradeBook',
  'individualRace',
  'individualEthnicity',
  'studentDemographics',
  'memberDemographics',
  'teamRacialComposition',
  'personalIncome',
] as const;

export type BannedSchoolContextFieldName = (typeof BANNED_SCHOOL_CONTEXT_FIELD_NAMES)[number];

const bannedFieldNameSet = new Set<string>(BANNED_SCHOOL_CONTEXT_FIELD_NAMES);

export type AggregateServiceAreaContext = {
  geographyType: ServiceAreaGeographyType;
  /** Official GEOID / NCES geography id for the aggregate area. */
  geographyId: string;
  medianHouseholdIncome?: number | null;
  /** 0–1 share or percent as published; callers should document units in evidenceNotes. */
  broadbandSubscriptionRate?: number | null;
  educationalAttainmentBachelorsPlusRate?: number | null;
  povertyRate?: number | null;
};

/**
 * Future optional enrichment keyed by NCES identity (#16).
 * Only allowlisted aggregate fields — no student-level shapes.
 */
export type AggregateSchoolContext = {
  schemaVersion: typeof AGGREGATE_SCHOOL_CONTEXT_SCHEMA_VERSION;
  ncesSchoolId?: string | null;
  ncesLeaId?: string | null;
  ncesPssId?: string | null;
  schoolType?: string | null;
  gradeRangeLow?: string | null;
  gradeRangeHigh?: string | null;
  /** School or LEA membership total — never a roster. */
  enrollmentTotal?: number | null;
  districtName?: string | null;
  localeCode?: string | null;
  localeLabel?: string | null;
  serviceArea?: AggregateServiceAreaContext | null;
  source?: string | null;
  retrievedAt?: string | null;
  /** e.g. ACS vintage year */
  vintage?: string | null;
  evidenceNotes?: string | null;
};

const nullableString = v.nullable(v.string());
const nullableNumber = v.nullable(v.number());

export const aggregateServiceAreaContextSchema = v.strictObject({
  geographyType: v.picklist([...SERVICE_AREA_GEOGRAPHY_TYPES]),
  geographyId: v.pipe(v.string(), v.minLength(1)),
  medianHouseholdIncome: v.optional(nullableNumber),
  broadbandSubscriptionRate: v.optional(nullableNumber),
  educationalAttainmentBachelorsPlusRate: v.optional(nullableNumber),
  povertyRate: v.optional(nullableNumber),
});

export const aggregateSchoolContextSchema = v.strictObject({
  schemaVersion: v.literal(AGGREGATE_SCHOOL_CONTEXT_SCHEMA_VERSION),
  ncesSchoolId: v.optional(nullableString),
  ncesLeaId: v.optional(nullableString),
  ncesPssId: v.optional(nullableString),
  schoolType: v.optional(nullableString),
  gradeRangeLow: v.optional(nullableString),
  gradeRangeHigh: v.optional(nullableString),
  enrollmentTotal: v.optional(nullableNumber),
  districtName: v.optional(nullableString),
  localeCode: v.optional(nullableString),
  localeLabel: v.optional(nullableString),
  serviceArea: v.optional(v.nullable(aggregateServiceAreaContextSchema)),
  source: v.optional(nullableString),
  retrievedAt: v.optional(nullableString),
  vintage: v.optional(nullableString),
  evidenceNotes: v.optional(nullableString),
});

export type ParseAggregateSchoolContextResult =
  | { ok: true; data: AggregateSchoolContext }
  | { ok: false; issues: Array<{ path: string; message: string }> };

function collectObjectKeys(value: unknown, path: string, into: Array<{ path: string; key: string }>): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectObjectKeys(item, `${path}[${index}]`, into));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = path ? `${path}.${key}` : key;
    into.push({ path: childPath, key });
    collectObjectKeys(child, childPath, into);
  }
}

/** Returns banned field hits anywhere in a nested payload (including arrays). */
export function findBannedSchoolContextFields(
  value: unknown,
): Array<{ path: string; key: string }> {
  const keys: Array<{ path: string; key: string }> = [];
  collectObjectKeys(value, '', keys);
  return keys.filter(({ key }) => bannedFieldNameSet.has(key));
}

export function assertNoBannedSchoolContextFields(value: unknown): void {
  const banned = findBannedSchoolContextFields(value);
  if (banned.length === 0) return;
  const detail = banned.map((hit) => `${hit.path || hit.key}`).join(', ');
  throw new Error(`Banned school/community context field(s): ${detail}`);
}

function issuePath(issue: v.BaseIssue<unknown>): string {
  const suffix = (issue.path ?? [])
    .map((segment) => String(segment.key ?? segment))
    .filter(Boolean)
    .join('.');
  return suffix || '(root)';
}

/**
 * Rejects banned field names first, then validates the allowlisted strict schema.
 * Does not fetch or embed live Census data.
 */
export function parseAggregateSchoolContext(input: unknown): ParseAggregateSchoolContextResult {
  const banned = findBannedSchoolContextFields(input);
  if (banned.length > 0) {
    return {
      ok: false,
      issues: banned.map((hit) => ({
        path: hit.path || hit.key,
        message: `Banned field "${hit.key}" is not allowed on aggregate school context`,
      })),
    };
  }

  const parsed = v.safeParse(aggregateSchoolContextSchema, input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.issues.map((issue) => ({
        path: issuePath(issue),
        message: issue.message,
      })),
    };
  }

  return { ok: true, data: parsed.output };
}
