/**
 * Team-submitted corrections and moderation records (#32).
 *
 * Submissions are reviewable change proposals only. Approving produces a
 * patch proposal — it never mutates generated seed or observations files.
 */
import * as v from 'valibot';

export const TEAM_CORRECTIONS_SCHEMA_VERSION = 1 as const;

export const MODERATION_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export const CORRECTION_CHANGE_KINDS = [
  'link',
  'school_org_text',
  'lineage_confirm',
  'lineage_reject',
  'sister_team',
  'historical_note',
  'other',
] as const;
export type CorrectionChangeKind = (typeof CORRECTION_CHANGE_KINDS)[number];

export const LINK_CHANGE_TYPES = [
  'website',
  'social',
  'code',
  'video',
  'cad',
  'docs',
  'community',
  'other',
] as const;
export type LinkChangeType = (typeof LINK_CHANGE_TYPES)[number];

/** Optional submitter contact — adult/org roles only; never student PII. */
export type SubmitterContact = {
  /** Email or GitHub handle. Optional; omit if exporting anonymously. */
  contact?: string | null;
  /** Role hint such as mentor, coach, alumni — not a student name. */
  roleHint?: string | null;
};

export type ProposedChange = {
  kind: CorrectionChangeKind;
  /** Human-readable field label when useful (e.g. organization, website). */
  field?: string | null;
  /** Proposed text, URL, or note body. */
  value?: string | null;
  /** Link subtype when kind is `link`. */
  linkType?: LinkChangeType | null;
  /** Related team number for lineage / sister suggestions. */
  relatedTeamNumber?: number | null;
  /**
   * Stable relationship evidence / edge id (e.g. graph `related:` id).
   * Required for lineage confirm/reject so maintainers can audit the claim.
   */
  relationshipEvidenceId?: string | null;
  notes?: string | null;
};

export type CorrectionSubmissionInput = {
  teamNumber: number;
  proposedChanges: ProposedChange[];
  evidenceUrls?: string[];
  submitter?: SubmitterContact | null;
  /** Free-text summary for maintainers. */
  message?: string | null;
  /**
   * Honeypot — must be empty/absent. Bots that fill "website" are rejected.
   * Never displayed as a real field label in accessible UI copy.
   */
  companyUrl?: string | null;
};

/**
 * Patch proposal returned by applyApproved / approve.
 * `autoApply` is always false — maintainers apply manually after verification.
 */
export type SeedPatchProposal = {
  kind: 'seed-patch-proposal';
  schemaVersion: typeof TEAM_CORRECTIONS_SCHEMA_VERSION;
  teamNumber: number;
  summary: string;
  changes: ProposedChange[];
  evidenceUrls: string[];
  /** Always false: never write generated seed/observations automatically. */
  autoApply: false;
  /** Suggested curator override rows for lineage confirm/reject. */
  relationshipOverrides?: Array<{
    teamNumberA: number;
    teamNumberB: number;
    confirmationState: 'confirmed' | 'rejected';
    relationshipEvidenceId?: string | null;
    note?: string | null;
  }>;
  /** Suggested link rows — still require manual seed/enrichment merge. */
  linkSuggestions?: Array<{
    type: LinkChangeType;
    label: string;
    url: string;
    confirmationState: 'unconfirmed';
  }>;
  schoolOrgTextSuggestion?: string | null;
  historicalNotes?: string[];
};

export type ModerationRecord = {
  id: string;
  schemaVersion: typeof TEAM_CORRECTIONS_SCHEMA_VERSION;
  status: ModerationStatus;
  teamNumber: number;
  proposedChanges: ProposedChange[];
  evidenceUrls: string[];
  submitter?: SubmitterContact | null;
  message?: string | null;
  createdAt: string;
  updatedAt: string;
  moderatedAt?: string | null;
  moderatorNote?: string | null;
  /** Set on approve — proposal only; does not mutate seed. */
  approvedPatch?: SeedPatchProposal | null;
};

export type ModerationQueueDocument = {
  schemaVersion: typeof TEAM_CORRECTIONS_SCHEMA_VERSION;
  exportedAt: string;
  records: ModerationRecord[];
};

const nullableString = v.nullable(v.string());
const optionalNullableString = v.optional(nullableString);

export const proposedChangeSchema = v.object({
  kind: v.picklist(CORRECTION_CHANGE_KINDS),
  field: optionalNullableString,
  value: optionalNullableString,
  linkType: v.optional(v.nullable(v.picklist(LINK_CHANGE_TYPES))),
  relatedTeamNumber: v.optional(v.nullable(v.number())),
  relationshipEvidenceId: optionalNullableString,
  notes: optionalNullableString,
});

export const submitterContactSchema = v.object({
  contact: optionalNullableString,
  roleHint: optionalNullableString,
});

export const seedPatchProposalSchema = v.object({
  kind: v.literal('seed-patch-proposal'),
  schemaVersion: v.literal(TEAM_CORRECTIONS_SCHEMA_VERSION),
  teamNumber: v.pipe(v.number(), v.integer(), v.minValue(1)),
  summary: v.pipe(v.string(), v.minLength(1)),
  changes: v.array(proposedChangeSchema),
  evidenceUrls: v.array(v.string()),
  autoApply: v.literal(false),
  relationshipOverrides: v.optional(
    v.array(
      v.object({
        teamNumberA: v.pipe(v.number(), v.integer(), v.minValue(1)),
        teamNumberB: v.pipe(v.number(), v.integer(), v.minValue(1)),
        confirmationState: v.picklist(['confirmed', 'rejected']),
        relationshipEvidenceId: optionalNullableString,
        note: optionalNullableString,
      }),
    ),
  ),
  linkSuggestions: v.optional(
    v.array(
      v.object({
        type: v.picklist(LINK_CHANGE_TYPES),
        label: v.pipe(v.string(), v.minLength(1)),
        url: v.pipe(v.string(), v.minLength(1)),
        confirmationState: v.literal('unconfirmed'),
      }),
    ),
  ),
  schoolOrgTextSuggestion: optionalNullableString,
  historicalNotes: v.optional(v.array(v.string())),
});

export const moderationRecordSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  schemaVersion: v.literal(TEAM_CORRECTIONS_SCHEMA_VERSION),
  status: v.picklist(MODERATION_STATUSES),
  teamNumber: v.pipe(v.number(), v.integer(), v.minValue(1)),
  proposedChanges: v.pipe(v.array(proposedChangeSchema), v.minLength(1)),
  evidenceUrls: v.array(v.string()),
  submitter: v.optional(v.nullable(submitterContactSchema)),
  message: optionalNullableString,
  createdAt: v.pipe(v.string(), v.minLength(1)),
  updatedAt: v.pipe(v.string(), v.minLength(1)),
  moderatedAt: optionalNullableString,
  moderatorNote: optionalNullableString,
  approvedPatch: v.optional(v.nullable(seedPatchProposalSchema)),
});

export const moderationQueueDocumentSchema = v.object({
  schemaVersion: v.literal(TEAM_CORRECTIONS_SCHEMA_VERSION),
  exportedAt: v.pipe(v.string(), v.minLength(1)),
  records: v.array(moderationRecordSchema),
});

export type CorrectionIssue = {
  path: string;
  message: string;
};

export function parseModerationRecord(
  value: unknown,
): { ok: true; data: ModerationRecord } | { ok: false; issues: CorrectionIssue[] } {
  const result = v.safeParse(moderationRecordSchema, value);
  if (result.success) {
    return { ok: true, data: result.output as ModerationRecord };
  }
  return {
    ok: false,
    issues: result.issues.map((issue) => ({
      path: (issue.path ?? []).map((part) => String(part.key ?? part)).join('.') || '(root)',
      message: issue.message,
    })),
  };
}

export function parseModerationQueueDocument(
  value: unknown,
): { ok: true; data: ModerationQueueDocument } | { ok: false; issues: CorrectionIssue[] } {
  const result = v.safeParse(moderationQueueDocumentSchema, value);
  if (result.success) {
    return { ok: true, data: result.output as ModerationQueueDocument };
  }
  return {
    ok: false,
    issues: result.issues.map((issue) => ({
      path: (issue.path ?? []).map((part) => String(part.key ?? part)).join('.') || '(root)',
      message: issue.message,
    })),
  };
}
