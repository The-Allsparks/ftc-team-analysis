import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import {
  AGGREGATE_SCHOOL_CONTEXT_SCHEMA_VERSION,
  BANNED_SCHOOL_CONTEXT_FIELD_NAMES,
  aggregateSchoolContextSchema,
  assertNoBannedSchoolContextFields,
  findBannedSchoolContextFields,
  parseAggregateSchoolContext,
  type AggregateSchoolContext,
} from './aggregateSchoolContext';

const minimalValid: AggregateSchoolContext = {
  schemaVersion: AGGREGATE_SCHOOL_CONTEXT_SCHEMA_VERSION,
  ncesSchoolId: '320000000001',
  schoolType: 'Regular school',
  gradeRangeLow: '09',
  gradeRangeHigh: '12',
  enrollmentTotal: 1200,
  districtName: 'Example County School District',
  localeCode: '21',
  localeLabel: 'Suburb, Large',
  serviceArea: {
    geographyType: 'school-district',
    geographyId: '3200001',
    medianHouseholdIncome: 65000,
    broadbandSubscriptionRate: 0.88,
    educationalAttainmentBachelorsPlusRate: 0.31,
    povertyRate: 0.12,
  },
  source: 'research-fixture',
  retrievedAt: null,
  vintage: '2022',
};

describe('aggregateSchoolContext allowlist', () => {
  it('documents an explicit banned-field deny list', () => {
    expect(BANNED_SCHOOL_CONTEXT_FIELD_NAMES).toEqual(
      expect.arrayContaining([
        'students',
        'roster',
        'email',
        'phone',
        'homeAddress',
        'birthDate',
        'studentDemographics',
        'teamRacialComposition',
      ]),
    );
  });

  it('accepts a minimal allowlisted aggregate payload', () => {
    const result = v.safeParse(aggregateSchoolContextSchema, minimalValid);
    expect(result.success).toBe(true);
    const parsed = parseAggregateSchoolContext(minimalValid);
    expect(parsed.ok).toBe(true);
  });

  it('rejects unknown keys via strictObject', () => {
    const result = v.safeParse(aggregateSchoolContextSchema, {
      ...minimalValid,
      undocumentedScore: 99,
    });
    expect(result.success).toBe(false);
  });

  it('rejects banned top-level field names', () => {
    const withRoster = {
      ...minimalValid,
      roster: [{ studentName: 'Ada' }],
    };
    expect(findBannedSchoolContextFields(withRoster).map((h) => h.key)).toEqual(
      expect.arrayContaining(['roster', 'studentName']),
    );
    expect(parseAggregateSchoolContext(withRoster).ok).toBe(false);
    expect(() => assertNoBannedSchoolContextFields(withRoster)).toThrow(/roster/);
  });

  it('rejects nested student-level shapes', () => {
    const nested = {
      schemaVersion: 1,
      students: [{ email: 'student@example.com', birthDate: '2010-01-01' }],
    };
    const banned = findBannedSchoolContextFields(nested).map((h) => h.key);
    expect(banned).toEqual(expect.arrayContaining(['students', 'email', 'birthDate']));
    const parsed = parseAggregateSchoolContext(nested);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.issues.some((i) => /Banned field/.test(i.message))).toBe(true);
    }
  });

  it('rejects memberDemographics and teamRacialComposition even when otherwise schema-shaped', () => {
    for (const key of ['memberDemographics', 'teamRacialComposition'] as const) {
      const payload = { ...minimalValid, [key]: { share: 0.5 } };
      expect(parseAggregateSchoolContext(payload).ok).toBe(false);
    }
  });

  it('does not require live Census fields in seed — empty identity stub is enough', () => {
    const stub: AggregateSchoolContext = {
      schemaVersion: AGGREGATE_SCHOOL_CONTEXT_SCHEMA_VERSION,
      ncesSchoolId: null,
      ncesLeaId: null,
    };
    expect(parseAggregateSchoolContext(stub).ok).toBe(true);
  });
});
