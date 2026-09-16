/**
 * Runtime schemas for authenticated FIRST FTC Events API payloads (#17).
 * Invalid team rows are quarantined; a non-object envelope is a hard parse failure.
 */
import * as v from 'valibot';

export type FirstApiTeam = {
  teamNumber: number;
  displayTeamNumber?: string | null;
  nameShort?: string | null;
  nameFull?: string | null;
  schoolName?: string | null;
  city?: string | null;
  stateProv?: string | null;
  country?: string | null;
  website?: string | null;
  rookieYear?: number | null;
  robotName?: string | null;
  homeRegion?: string | null;
  displayLocation?: string | null;
};

export type FirstApiTeamsPage = {
  teams?: FirstApiTeam[] | null;
  teamCountTotal?: number;
  teamCountPage?: number;
  pageCurrent?: number;
  pageTotal?: number;
};

export type FirstApiIssue = {
  path: string;
  message: string;
};

export type ParseFirstApiTeamsPageResult =
  | {
      ok: true;
      data: FirstApiTeamsPage;
      quarantined: FirstApiIssue[];
      quarantinedRecordCount: number;
    }
  | { ok: false; issues: FirstApiIssue[] };

export const FIRST_API_TEAMS_PAGE_NOT_OBJECT = 'FIRST API teams payload is not an object.';
export const FIRST_API_TEAMS_NOT_ARRAY = 'FIRST API teams payload is missing a teams array.';

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
): FirstApiIssue[] {
  return issues.map((issue) => ({
    path: issuePath(issue, prefix),
    message: issue.message,
  }));
}

const optionalNullableString = v.optional(v.nullable(v.string()));
const optionalNullableNumber = v.optional(v.nullable(v.number()));

const firstApiTeamSchema = v.looseObject({
  teamNumber: v.number(),
  displayTeamNumber: optionalNullableString,
  nameShort: optionalNullableString,
  nameFull: optionalNullableString,
  schoolName: optionalNullableString,
  city: optionalNullableString,
  stateProv: optionalNullableString,
  country: optionalNullableString,
  website: optionalNullableString,
  rookieYear: optionalNullableNumber,
  robotName: optionalNullableString,
  homeRegion: optionalNullableString,
  displayLocation: optionalNullableString,
});

const firstApiTeamsPageSchema = v.looseObject({
  teams: v.optional(v.nullable(v.array(v.unknown()))),
  teamCountTotal: optionalNullableNumber,
  teamCountPage: optionalNullableNumber,
  pageCurrent: optionalNullableNumber,
  pageTotal: optionalNullableNumber,
});

function trimNullable(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeTeam(wire: v.InferOutput<typeof firstApiTeamSchema>): FirstApiTeam {
  return {
    teamNumber: wire.teamNumber,
    displayTeamNumber: trimNullable(wire.displayTeamNumber),
    nameShort: trimNullable(wire.nameShort),
    nameFull: trimNullable(wire.nameFull),
    schoolName: trimNullable(wire.schoolName),
    city: trimNullable(wire.city),
    stateProv: trimNullable(wire.stateProv),
    country: trimNullable(wire.country),
    website: trimNullable(wire.website),
    rookieYear: wire.rookieYear ?? null,
    robotName: trimNullable(wire.robotName),
    homeRegion: trimNullable(wire.homeRegion),
    displayLocation: trimNullable(wire.displayLocation),
  };
}

export function parseFirstApiTeamsPage(raw: unknown): ParseFirstApiTeamsPageResult {
  if (!isPlainObject(raw)) {
    return {
      ok: false,
      issues: [{ path: '(root)', message: FIRST_API_TEAMS_PAGE_NOT_OBJECT }],
    };
  }

  const envelope = v.safeParse(firstApiTeamsPageSchema, raw);
  if (!envelope.success) {
    return { ok: false, issues: issuesFromValibot(envelope.issues) };
  }

  const teamsRaw = envelope.output.teams;
  if (teamsRaw == null) {
    return {
      ok: false,
      issues: [{ path: 'teams', message: FIRST_API_TEAMS_NOT_ARRAY }],
    };
  }

  const teams: FirstApiTeam[] = [];
  const quarantined: FirstApiIssue[] = [];
  let quarantinedRecordCount = 0;

  teamsRaw.forEach((value, index) => {
    const parsed = v.safeParse(firstApiTeamSchema, value);
    if (parsed.success) {
      teams.push(normalizeTeam(parsed.output));
      return;
    }
    quarantinedRecordCount += 1;
    quarantined.push(...issuesFromValibot(parsed.issues, `teams[${index}]`));
  });

  return {
    ok: true,
    data: {
      teams,
      teamCountTotal: envelope.output.teamCountTotal ?? undefined,
      teamCountPage: envelope.output.teamCountPage ?? undefined,
      pageCurrent: envelope.output.pageCurrent ?? undefined,
      pageTotal: envelope.output.pageTotal ?? undefined,
    },
    quarantined,
    quarantinedRecordCount,
  };
}
