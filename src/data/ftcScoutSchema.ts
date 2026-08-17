/**
 * Runtime schemas for live FTCScout REST payloads used by `src/lib/ftcScout.ts`.
 *
 * Invalid event rows are quarantined; envelope / quick-stats failures are hard
 * parse failures (mapped to SourceResult `parse_failure` by the fetch layer).
 */
import * as v from 'valibot';
import { ScoutEventParticipation, ScoutQuickStats, ScoutTeamProfile } from './ftcScout';

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
export const SCOUT_TEAM_PROFILE_NOT_OBJECT = 'FTCScout team profile payload is not an object.';

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

/** Shared totals group used by opr / avg / dev (season-specific extra keys allowed). */
const scoutPointGroupSchema = v.looseObject({
  totalPoints: optionalNullableNumber,
  autoPoints: optionalNullableNumber,
  dcPoints: optionalNullableNumber,
});

const scoutEventStatsSchema = v.looseObject({
  rank: optionalNullableNumber,
  rp: optionalNullableNumber,
  wins: v.optional(v.number()),
  losses: v.optional(v.number()),
  ties: v.optional(v.number()),
  qualMatchesPlayed: optionalNullableNumber,
  opr: v.optional(v.nullable(scoutPointGroupSchema)),
  avg: v.optional(v.nullable(scoutPointGroupSchema)),
  /** Upstream variability group; normalized to `scoreSpread` from `totalPoints`. */
  dev: v.optional(v.nullable(scoutPointGroupSchema)),
});

const scoutEventParticipationSchema = v.looseObject({
  season: v.number(),
  eventCode: v.string(),
  teamNumber: v.number(),
  stats: v.nullable(scoutEventStatsSchema),
});

const optionalNullableString = v.optional(v.nullable(v.string()));

const scoutTeamProfileSchema = v.looseObject({
  number: v.number(),
  name: optionalNullableString,
  schoolName: optionalNullableString,
  city: optionalNullableString,
  state: optionalNullableString,
  country: optionalNullableString,
  website: optionalNullableString,
  rookieYear: optionalNullableNumber,
  updatedAt: optionalNullableString,
});

export type ParseScoutTeamProfileResult =
  | { ok: true; data: ScoutTeamProfile }
  | { ok: false; issues: ScoutIssue[] };

/** Wire shape before normalize maps `dev.totalPoints` → `scoreSpread`. */
type ScoutEventStatsWire = {
  rank?: number | null;
  rp?: number | null;
  wins?: number;
  losses?: number;
  ties?: number;
  qualMatchesPlayed?: number | null;
  opr?: {
    totalPoints?: number | null;
    autoPoints?: number | null;
    dcPoints?: number | null;
  } | null;
  avg?: {
    totalPoints?: number | null;
  } | null;
  dev?: {
    totalPoints?: number | null;
  } | null;
};

type ScoutEventParticipationWire = {
  season: number;
  eventCode: string;
  teamNumber: number;
  stats: ScoutEventStatsWire | null;
};

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

function scoreSpreadFromDev(dev: ScoutEventStatsWire['dev']): number | null {
  const value = dev?.totalPoints;
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }
  return value;
}

function toScoutEventParticipation(wire: ScoutEventParticipationWire): ScoutEventParticipation {
  if (!wire.stats) {
    return {
      season: wire.season,
      eventCode: wire.eventCode,
      teamNumber: wire.teamNumber,
      stats: null,
    };
  }

  return {
    season: wire.season,
    eventCode: wire.eventCode,
    teamNumber: wire.teamNumber,
    stats: {
      rank: wire.stats.rank ?? null,
      rp: wire.stats.rp ?? null,
      wins: wire.stats.wins ?? 0,
      losses: wire.stats.losses ?? 0,
      ties: wire.stats.ties ?? 0,
      qualMatchesPlayed: wire.stats.qualMatchesPlayed ?? null,
      opr: wire.stats.opr
        ? {
            totalPoints: wire.stats.opr.totalPoints ?? null,
            autoPoints: wire.stats.opr.autoPoints ?? null,
            dcPoints: wire.stats.opr.dcPoints ?? null,
          }
        : null,
      avg: wire.stats.avg
        ? {
            totalPoints: wire.stats.avg.totalPoints ?? null,
          }
        : null,
      scoreSpread: scoreSpreadFromDev(wire.stats.dev),
    },
  };
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
      valid.push(toScoutEventParticipation(parsed.output as ScoutEventParticipationWire));
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

function trimNullable(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function parseScoutTeamProfile(raw: unknown): ParseScoutTeamProfileResult {
  if (!isPlainObject(raw)) {
    return {
      ok: false,
      issues: [{ path: '(root)', message: SCOUT_TEAM_PROFILE_NOT_OBJECT }],
    };
  }

  const parsed = v.safeParse(scoutTeamProfileSchema, raw);
  if (!parsed.success) {
    return { ok: false, issues: issuesFromValibot(parsed.issues) };
  }

  const wire = parsed.output;
  return {
    ok: true,
    data: {
      number: wire.number,
      name: trimNullable(wire.name),
      schoolName: trimNullable(wire.schoolName),
      city: trimNullable(wire.city),
      state: trimNullable(wire.state),
      country: trimNullable(wire.country),
      website: trimNullable(wire.website),
      rookieYear: wire.rookieYear ?? null,
      updatedAt: trimNullable(wire.updatedAt),
    },
  };
}
