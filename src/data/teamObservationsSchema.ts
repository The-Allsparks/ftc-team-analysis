/**
 * Runtime schema for append-only team observation side store (#29).
 */
import * as v from 'valibot';
import { SUPPORTED_SEASONS, TeamObservationsData } from './schema';
import { TEAM_OBSERVATIONS_SCHEMA_VERSION } from '../lib/teamObservations';

export { TEAM_OBSERVATIONS_SCHEMA_VERSION };

export type ObservationsIssue = {
  path: string;
  message: string;
};

export type ParseTeamObservationsResult =
  | { ok: true; data: TeamObservationsData; quarantined: ObservationsIssue[] }
  | { ok: false; kind: 'invalid-envelope'; issues: ObservationsIssue[] };

const seasonIdSchema = v.picklist(SUPPORTED_SEASONS);
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
  'active',
]);
const factKindSchema = v.picklist(['observed', 'derived']);
const observationStatusSchema = v.picklist(['current', 'conflicting', 'superseded']);
const confidenceSchema = v.picklist(['high', 'medium', 'low']);
const confirmationSchema = v.picklist(['unconfirmed', 'confirmed', 'rejected']);
const nullableString = v.nullable(v.string());

const observationRecordSchema = v.looseObject({
  teamNumber: v.number(),
  id: v.string(),
  field: teamFactFieldSchema,
  value: v.string(),
  kind: factKindSchema,
  sourceType: v.string(),
  sourceUrl: nullableString,
  retrievedAt: nullableString,
  observedSeason: seasonIdSchema,
  extractionMethod: v.string(),
  confidence: confidenceSchema,
  confirmationState: confirmationSchema,
  status: observationStatusSchema,
  rawValue: nullableString,
  supersedesId: nullableString,
});

const observationsEnvelopeSchema = v.looseObject({
  generatedAt: v.string(),
  schemaVersion: v.optional(v.number()),
  regionCode: v.string(),
  observations: v.array(v.unknown()),
});

function issuePath(issue: v.BaseIssue<unknown>, prefix = ''): string {
  const suffix = (issue.path ?? [])
    .map((item) => (typeof item.key === 'number' ? `[${item.key}]` : `.${String(item.key)}`))
    .join('');
  return `${prefix}${suffix}`.replace(/^\./, '') || '(root)';
}

export function parseTeamObservations(raw: unknown): ParseTeamObservationsResult {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ok: false,
      kind: 'invalid-envelope',
      issues: [{ path: '(root)', message: 'Observations file is not an object.' }],
    };
  }

  const envelope = v.safeParse(observationsEnvelopeSchema, raw);
  if (!envelope.success) {
    return {
      ok: false,
      kind: 'invalid-envelope',
      issues: envelope.issues.map((issue) => ({
        path: issuePath(issue),
        message: issue.message,
      })),
    };
  }

  const schemaVersion = envelope.output.schemaVersion;
  if (schemaVersion !== undefined && schemaVersion !== TEAM_OBSERVATIONS_SCHEMA_VERSION) {
    return {
      ok: false,
      kind: 'invalid-envelope',
      issues: [
        {
          path: 'schemaVersion',
          message: `Unsupported observations schemaVersion ${schemaVersion}; expected ${TEAM_OBSERVATIONS_SCHEMA_VERSION}.`,
        },
      ],
    };
  }

  const quarantined: ObservationsIssue[] = [];
  const observations: TeamObservationsData['observations'] = [];

  for (const [index, row] of envelope.output.observations.entries()) {
    const parsed = v.safeParse(observationRecordSchema, row);
    if (!parsed.success) {
      quarantined.push({
        path: `observations[${index}]`,
        message: parsed.issues.map((issue) => issue.message).join('; '),
      });
      continue;
    }
    observations.push(parsed.output);
  }

  if (envelope.output.observations.length > 0 && observations.length === 0) {
    return {
      ok: false,
      kind: 'invalid-envelope',
      issues: [
        {
          path: 'observations',
          message: `All ${envelope.output.observations.length} observation record(s) were invalid.`,
        },
        ...quarantined,
      ],
    };
  }

  const data: TeamObservationsData = {
    generatedAt: envelope.output.generatedAt,
    schemaVersion: schemaVersion ?? TEAM_OBSERVATIONS_SCHEMA_VERSION,
    regionCode: envelope.output.regionCode,
    observations,
  };

  return { ok: true, data, quarantined };
}
