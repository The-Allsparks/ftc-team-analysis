/**
 * Runtime schema for checked-in generated Nevada snapshots (`GeneratedData`).
 *
 * `GENERATED_DATA_SCHEMA_VERSION` is 1. The current seed JSON omits `schemaVersion`
 * and is treated as version 1. A present value other than 1 fails the envelope.
 *
 * Document-level provenance is the `sources` array already on the seed. Optional
 * season `affiliations` and `evidence` are additive under v1
 * (see docs/organization-affiliations.md and docs/field-evidence.md).
 */
import * as v from 'valibot';
import {
  DataSource,
  GeneratedData,
  RegionEvent,
  TARGET_SEASONS,
  Team,
} from './schema';

export const GENERATED_DATA_SCHEMA_VERSION = 1;

export const GENERATED_SEED_NOT_OBJECT = 'Generated seed is not an object with a teams array.';
export const GENERATED_SEED_EMPTY_TEAMS = 'Generated seed has an empty teams array.';

export function generatedSeedAllQuarantinedMessage(count: number): string {
  return `Generated seed has no valid teams; ${count} invalid team record(s) were quarantined.`;
}

export type SeedIssue = {
  path: string;
  message: string;
  teamNumber?: number;
};

export type ParseGeneratedSeedResult =
  | { ok: true; data: GeneratedData; quarantined: SeedIssue[] }
  | { ok: false; kind: 'invalid-envelope'; issues: SeedIssue[] };

const seasonIdSchema = v.picklist(TARGET_SEASONS);
const seasonKeySchema = v.picklist(TARGET_SEASONS.map(String));
const teamTypeSchema = v.picklist(['school', 'non-school', 'unknown']);
const teamLinkTypeSchema = v.picklist([
  'website',
  'social',
  'code',
  'video',
  'cad',
  'docs',
  'community',
  'link-hub',
  'other',
]);
const organizationEntityTypeSchema = v.picklist([
  'school',
  'school_district',
  'host_organization',
  'program_operator',
  'community_organization',
  'sponsor',
  'funder',
  'fiscal_sponsor',
  'team_affiliation',
]);
const affiliationConfidenceSchema = v.picklist(['high', 'medium', 'low']);
const affiliationConfirmationSchema = v.picklist(['unconfirmed', 'confirmed', 'rejected']);
const teamFactFieldSchema = v.picklist([
  'name',
  'location',
  'organization',
  'website',
  'record',
  'qualificationRecord',
  'playoffRecord',
  'rookieYear',
  'league',
  'region',
  'robot',
  'teamType',
]);
const factKindSchema = v.picklist(['observed', 'derived']);
const observationStatusSchema = v.picklist(['current', 'conflicting', 'superseded']);

const nullableString = v.nullable(v.string());
const nullableNumber = v.nullable(v.number());

const teamAffiliationSchema = v.looseObject({
  entityType: organizationEntityTypeSchema,
  name: v.string(),
  season: seasonIdSchema,
  source: v.string(),
  retrievedAt: nullableString,
  confidence: affiliationConfidenceSchema,
  confirmationState: affiliationConfirmationSchema,
  sourceText: v.string(),
});

const fieldEvidenceSchema = v.looseObject({
  id: v.string(),
  field: teamFactFieldSchema,
  value: v.string(),
  kind: factKindSchema,
  sourceType: v.string(),
  sourceUrl: nullableString,
  retrievedAt: nullableString,
  observedSeason: seasonIdSchema,
  extractionMethod: v.string(),
  confidence: affiliationConfidenceSchema,
  confirmationState: affiliationConfirmationSchema,
  status: observationStatusSchema,
  rawValue: nullableString,
  supersedesId: nullableString,
});

const recordSummarySchema = v.looseObject({
  wins: v.number(),
  losses: v.number(),
  ties: v.number(),
  text: v.string(),
});

const teamEventSchema = v.looseObject({
  code: nullableString,
  name: v.string(),
  dateRange: nullableString,
  eventOrder: nullableNumber,
  location: nullableString,
  league: nullableString,
  rank: nullableString,
  totalPoints: nullableNumber,
  matchCount: v.number(),
  rankingScore: nullableNumber,
  leagueSeasonRank: nullableNumber,
  leagueSeasonRankTotal: nullableNumber,
  qualificationUrl: nullableString,
  playoffUrl: nullableString,
  playoffRecord: nullableString,
  allianceSelection: nullableString,
  sourceUrl: nullableString,
});

const teamAwardSchema = v.looseObject({
  name: v.string(),
  awardType: v.string(),
  eventName: v.string(),
  eventCode: nullableString,
  awardUrl: nullableString,
  eventUrl: nullableString,
});

const teamLinkSchema = v.looseObject({
  type: teamLinkTypeSchema,
  label: v.string(),
  url: v.string(),
  source: v.string(),
});

const teamSeasonSchema = v.looseObject({
  season: seasonIdSchema,
  active: v.boolean(),
  name: v.string(),
  location: v.string(),
  city: nullableString,
  state: nullableString,
  country: nullableString,
  region: nullableString,
  league: nullableString,
  rookieYear: nullableNumber,
  organization: nullableString,
  affiliations: v.optional(v.array(teamAffiliationSchema)),
  teamType: teamTypeSchema,
  website: nullableString,
  robot: nullableString,
  sourceUrl: v.string(),
  summary: nullableString,
  record: v.nullable(recordSummarySchema),
  qualificationRecord: v.nullable(recordSummarySchema),
  playoffRecord: v.nullable(recordSummarySchema),
  events: v.array(teamEventSchema),
  awards: v.array(teamAwardSchema),
  notes: v.array(v.string()),
  evidence: v.optional(v.array(fieldEvidenceSchema)),
});

const teamSchema = v.looseObject({
  number: v.number(),
  latestName: v.string(),
  latestLocation: v.string(),
  latestCity: nullableString,
  latestState: nullableString,
  latestCountry: nullableString,
  latestRookieYear: nullableNumber,
  latestOrganization: nullableString,
  latestWebsite: nullableString,
  latestTeamType: teamTypeSchema,
  latestLeague: nullableString,
  latestRegion: nullableString,
  links: v.array(teamLinkSchema),
  seasons: v.pipe(
    v.record(seasonKeySchema, teamSeasonSchema),
    v.minEntries(1, 'Team must include at least one season.'),
  ),
});

const regionEventSchema = v.looseObject({
  season: seasonIdSchema,
  code: v.string(),
  name: v.string(),
  league: nullableString,
  location: nullableString,
  date: nullableString,
  sourceUrl: v.string(),
});

const dataSourceSchema = v.looseObject({
  label: v.string(),
  url: v.string(),
  note: v.string(),
});

const envelopeSchema = v.looseObject({
  generatedAt: v.pipe(v.string(), v.minLength(1)),
  liveRefreshedAt: v.optional(v.string()),
  targetSeasons: v.pipe(v.array(seasonIdSchema), v.minLength(1)),
  regionCode: v.pipe(v.string(), v.minLength(1)),
  regionLabel: v.optional(v.string()),
  schemaVersion: v.optional(
    v.literal(
      GENERATED_DATA_SCHEMA_VERSION,
      `Unsupported generated-data schemaVersion; expected ${GENERATED_DATA_SCHEMA_VERSION}.`,
    ),
  ),
  teams: v.array(v.unknown()),
  regionEvents: v.array(v.unknown()),
  sources: v.array(v.unknown()),
  limitations: v.array(v.string()),
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
  teamNumber?: number,
): SeedIssue[] {
  return issues.map((issue) => ({
    path: issuePath(issue, prefix),
    message: issue.message,
    ...(teamNumber !== undefined ? { teamNumber } : {}),
  }));
}

function readTeamNumber(value: unknown): number | undefined {
  if (!isPlainObject(value) || typeof value.number !== 'number' || !Number.isFinite(value.number)) {
    return undefined;
  }
  return value.number;
}

function parseItemList<T>(
  values: unknown[],
  schema: v.GenericSchema<unknown, T>,
  pathPrefix: string,
): { valid: T[]; quarantined: SeedIssue[] } {
  const valid: T[] = [];
  const quarantined: SeedIssue[] = [];

  values.forEach((value, index) => {
    const parsed = v.safeParse(schema, value);
    if (parsed.success) {
      valid.push(parsed.output);
      return;
    }
    quarantined.push(...issuesFromValibot(parsed.issues, `${pathPrefix}[${index}]`));
  });

  return { valid, quarantined };
}

export function parseGeneratedSeed(raw: unknown): ParseGeneratedSeedResult {
  if (!isPlainObject(raw) || !Array.isArray(raw.teams)) {
    return {
      ok: false,
      kind: 'invalid-envelope',
      issues: [{ path: isPlainObject(raw) ? 'teams' : '(root)', message: GENERATED_SEED_NOT_OBJECT }],
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

  if (envelope.output.teams.length === 0) {
    return {
      ok: false,
      kind: 'invalid-envelope',
      issues: [{ path: 'teams', message: GENERATED_SEED_EMPTY_TEAMS }],
    };
  }

  const quarantined: SeedIssue[] = [];
  const teams: Team[] = [];

  envelope.output.teams.forEach((team, index) => {
    const parsed = v.safeParse(teamSchema, team);
    const teamNumber = readTeamNumber(team);
    if (parsed.success) {
      teams.push(parsed.output as Team);
      return;
    }
    quarantined.push(...issuesFromValibot(parsed.issues, `teams[${index}]`, teamNumber));
  });

  if (teams.length === 0) {
    return {
      ok: false,
      kind: 'invalid-envelope',
      issues: [
        {
          path: 'teams',
          message: generatedSeedAllQuarantinedMessage(envelope.output.teams.length),
        },
        ...quarantined,
      ],
    };
  }

  const regionEvents = parseItemList(envelope.output.regionEvents, regionEventSchema, 'regionEvents');
  const sources = parseItemList(envelope.output.sources, dataSourceSchema, 'sources');
  quarantined.push(...regionEvents.quarantined, ...sources.quarantined);

  const data: GeneratedData = {
    ...envelope.output,
    teams,
    regionEvents: regionEvents.valid as RegionEvent[],
    sources: sources.valid as DataSource[],
  };

  return { ok: true, data, quarantined };
}
