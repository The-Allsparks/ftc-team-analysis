/**
 * Runtime schemas for live FTCScout REST payloads used by `src/lib/ftcScout.ts`.
 *
 * Invalid event rows are quarantined; envelope / quick-stats failures are hard
 * parse failures (mapped to SourceResult `parse_failure` by the fetch layer).
 */
import * as v from 'valibot';
import { ScoutEventParticipation, ScoutQuickStats } from './ftcScout';

export type ScoutIssue = {
  path: string;
  message: string;
};

export type ParseScoutQuickStatsResult =
  | { ok: true; data: ScoutQuickStats }
  | { ok: false; issues: ScoutIssue[] };

export type ParseScoutEventsResult =
  | {
      ok: true;
      data: ScoutEventParticipation[];
      quarantined: ScoutIssue[];
      quarantinedRecordCount: number;
    }
  | { ok: false; kind: 'invalid-envelope' | 'all-quarantined'; issues: ScoutIssue[] };

export const SCOUT_EVENTS_NOT_ARRAY = 'FTCScout events payload is not an array.';
export const SCOUT_QUICK_STATS_NOT_OBJECT = 'FTCScout quick-stats payload is not an object.';

export function scoutEventsAllQuarantinedMessage(count: number): string {
  return `FTCScout events payload has no valid records; ${count} invalid event(s) were quarantined.`;
}

const nullableNumber = v.nullable(v.number());
const optionalNullableNumber = v.optional(nullableNumber);

const scoutStatValueSchema = v.looseObject({
  value: v.number(),
  rank: optionalNullableNumber,
});

const scoutQuickStatsSchema = v.looseObject({
  season: v.number(),
  number: v.number(),
  tot: scoutStatValueSchema,
  auto: scoutStatValueSchema,
  dc: scoutStatValueSchema,
  eg: scoutStatValueSchema,
  count: v.number(),
});

const scoutOprSchema = v.looseObject({
  totalPoints: optionalNullableNumber,
  autoPoints: optionalNullableNumber,
  dcPoints: optionalNullableNumber,
});

const scoutAvgSchema = v.looseObject({
  totalPoints: optionalNullableNumber,
});

const scoutEventStatsSchema = v.looseObject({
  rank: optionalNullableNumber,
  rp: optionalNullableNumber,
  wins: v.optional(v.number()),
  losses: v.optional(v.number()),
  ties: v.optional(v.number()),
  qualMatchesPlayed: optionalNullableNumber,
  opr: v.optional(v.nullable(scoutOprSchema)),
  avg: v.optional(v.nullable(scoutAvgSchema)),
});

const scoutEventParticipationSchema = v.looseObject({
  season: v.number(),
  eventCode: v.string(),
  teamNumber: v.number(),
  stats: v.nullable(scoutEventStatsSchema),
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
): ScoutIssue[] {
  return issues.map((issue) => ({
    path: issuePath(issue, prefix),
    message: issue.message,
  }));
}

export function formatScoutIssues(issues: ScoutIssue[]): string {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
}

export function parseScoutQuickStats(raw: unknown): ParseScoutQuickStatsResult {
  if (!isPlainObject(raw)) {
    return {
      ok: false,
      issues: [{ path: '(root)', message: SCOUT_QUICK_STATS_NOT_OBJECT }],
    };
  }

  const parsed = v.safeParse(scoutQuickStatsSchema, raw);
  if (!parsed.success) {
    return { ok: false, issues: issuesFromValibot(parsed.issues) };
  }

  return { ok: true, data: parsed.output as ScoutQuickStats };
}

export function parseScoutEvents(raw: unknown): ParseScoutEventsResult {
  if (!Array.isArray(raw)) {
    return {
      ok: false,
      kind: 'invalid-envelope',
      issues: [{ path: '(root)', message: SCOUT_EVENTS_NOT_ARRAY }],
    };
  }

  const valid: ScoutEventParticipation[] = [];
  const quarantined: ScoutIssue[] = [];
  let quarantinedRecordCount = 0;

  raw.forEach((value, index) => {
    const parsed = v.safeParse(scoutEventParticipationSchema, value);
    if (parsed.success) {
      valid.push(parsed.output as ScoutEventParticipation);
      return;
    }
    quarantinedRecordCount += 1;
    quarantined.push(...issuesFromValibot(parsed.issues, `[${index}]`));
  });

  if (raw.length > 0 && valid.length === 0) {
    return {
      ok: false,
      kind: 'all-quarantined',
      issues: [
        { path: '(root)', message: scoutEventsAllQuarantinedMessage(raw.length) },
        ...quarantined,
      ],
    };
  }

  return { ok: true, data: valid, quarantined, quarantinedRecordCount };
}
