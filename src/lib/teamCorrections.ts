/**
 * Pure moderation workflow for team-submitted corrections (#32).
 *
 * createSubmission → pending
 * approve / reject → terminal states
 * applyApproved → SeedPatchProposal only (never mutates generated seed)
 */
import { relatedEdgeId } from '../data/relationshipGraph';
import type {
  CorrectionSubmissionInput,
  LinkChangeType,
  ModerationQueueDocument,
  ModerationRecord,
  ProposedChange,
  SeedPatchProposal,
  SubmitterContact,
} from '../data/teamCorrectionsSchema';
import {
  TEAM_CORRECTIONS_SCHEMA_VERSION,
  moderationRecordSchema,
  parseModerationRecord,
} from '../data/teamCorrectionsSchema';
import * as v from 'valibot';

/** Soft client-side tip: discourage rapid-fire submissions in the same browser. */
export const CORRECTION_RATE_TIP_MIN_INTERVAL_MS = 60_000;

export const MODERATION_QUEUE_STORAGE_KEY = 'ftc-team-analysis:moderation-queue';

export const CORRECTIONS_HASH = '#corrections';

export function isCorrectionsHash(hash: string): boolean {
  return hash === CORRECTIONS_HASH || hash === '#/corrections';
}

export type WorkflowErrorCode =
  | 'honeypot'
  | 'validation'
  | 'invalid_transition'
  | 'not_approved';

export type WorkflowResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: WorkflowErrorCode; message: string; issues?: string[] };

const MAX_MESSAGE_LENGTH = 2000;
const MAX_CONTACT_LENGTH = 120;
const MAX_ROLE_HINT_LENGTH = 40;
const MAX_CHANGES = 20;
const MAX_EVIDENCE_URLS = 10;
const MAX_VALUE_LENGTH = 2000;

function nowIso(clock: () => Date = () => new Date()): string {
  return clock().toISOString();
}

function newId(clock: () => Date = () => new Date()): string {
  const stamp = clock().toISOString().replace(/[:.]/g, '-');
  const rand = Math.random().toString(36).slice(2, 10);
  return `corr-${stamp}-${rand}`;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function cleanString(value: string | null | undefined, max: number): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, max);
}

function normalizeSubmitter(
  submitter: SubmitterContact | null | undefined,
): SubmitterContact | null {
  if (!submitter) {
    return null;
  }
  const contact = cleanString(submitter.contact, MAX_CONTACT_LENGTH);
  const roleHint = cleanString(submitter.roleHint, MAX_ROLE_HINT_LENGTH);
  if (!contact && !roleHint) {
    return null;
  }
  return { contact, roleHint };
}

function normalizeChange(change: ProposedChange): ProposedChange | null {
  if (!change?.kind) {
    return null;
  }
  const related =
    change.relatedTeamNumber != null && Number.isFinite(change.relatedTeamNumber)
      ? Math.trunc(change.relatedTeamNumber)
      : null;
  return {
    kind: change.kind,
    field: cleanString(change.field, 80),
    value: cleanString(change.value, MAX_VALUE_LENGTH),
    linkType: change.linkType ?? null,
    relatedTeamNumber: related != null && related >= 1 ? related : null,
    relationshipEvidenceId: cleanString(change.relationshipEvidenceId, 200),
    notes: cleanString(change.notes, 500),
  };
}

function validateProposedChanges(changes: ProposedChange[]): string[] {
  const issues: string[] = [];
  if (changes.length === 0) {
    issues.push('At least one proposed change is required.');
  }
  if (changes.length > MAX_CHANGES) {
    issues.push(`At most ${MAX_CHANGES} proposed changes are allowed.`);
  }

  for (const [index, change] of changes.entries()) {
    const prefix = `proposedChanges[${index}]`;
    if (change.kind === 'link') {
      if (!change.value || !isHttpUrl(change.value)) {
        issues.push(`${prefix}: link changes require an http(s) URL value.`);
      }
    }
    if (change.kind === 'school_org_text' || change.kind === 'historical_note') {
      if (!change.value) {
        issues.push(`${prefix}: ${change.kind} requires a text value.`);
      }
    }
    if (change.kind === 'lineage_confirm' || change.kind === 'lineage_reject') {
      if (change.relatedTeamNumber == null || change.relatedTeamNumber < 1) {
        issues.push(`${prefix}: lineage actions require relatedTeamNumber.`);
      }
      if (!change.relationshipEvidenceId) {
        issues.push(`${prefix}: lineage actions require relationshipEvidenceId.`);
      }
    }
    if (change.kind === 'sister_team') {
      if (change.relatedTeamNumber == null || change.relatedTeamNumber < 1) {
        issues.push(`${prefix}: sister_team requires relatedTeamNumber.`);
      }
    }
  }
  return issues;
}

/**
 * Create a pending moderation record from a submission.
 * Honeypot (`companyUrl`) must be empty. Does not touch seed files.
 */
export function createSubmission(
  input: CorrectionSubmissionInput,
  options?: { clock?: () => Date; idFactory?: () => string },
): WorkflowResult<ModerationRecord> {
  const clock = options?.clock ?? (() => new Date());
  const honeypot = input.companyUrl?.trim() ?? '';
  if (honeypot.length > 0) {
    return {
      ok: false,
      code: 'honeypot',
      message: 'Submission rejected by spam control.',
    };
  }

  const teamNumber = Math.trunc(Number(input.teamNumber));
  if (!Number.isFinite(teamNumber) || teamNumber < 1) {
    return {
      ok: false,
      code: 'validation',
      message: 'A valid team number is required.',
      issues: ['teamNumber must be a positive integer.'],
    };
  }

  const proposedChanges = (input.proposedChanges ?? [])
    .map(normalizeChange)
    .filter((row): row is ProposedChange => row != null);

  const changeIssues = validateProposedChanges(proposedChanges);
  const evidenceUrls = (input.evidenceUrls ?? [])
    .map((url) => url.trim())
    .filter(Boolean)
    .slice(0, MAX_EVIDENCE_URLS);

  for (const [index, url] of evidenceUrls.entries()) {
    if (!isHttpUrl(url)) {
      changeIssues.push(`evidenceUrls[${index}] must be an http(s) URL.`);
    }
  }

  const message = cleanString(input.message, MAX_MESSAGE_LENGTH);
  if (changeIssues.length > 0) {
    return {
      ok: false,
      code: 'validation',
      message: 'Submission failed validation.',
      issues: changeIssues,
    };
  }

  const createdAt = nowIso(clock);
  const record: ModerationRecord = {
    id: options?.idFactory?.() ?? newId(clock),
    schemaVersion: TEAM_CORRECTIONS_SCHEMA_VERSION,
    status: 'pending',
    teamNumber,
    proposedChanges,
    evidenceUrls,
    submitter: normalizeSubmitter(input.submitter),
    message,
    createdAt,
    updatedAt: createdAt,
    moderatedAt: null,
    moderatorNote: null,
    approvedPatch: null,
  };

  const parsed = v.safeParse(moderationRecordSchema, record);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'validation',
      message: 'Submission failed schema validation.',
      issues: parsed.issues.map((issue) => issue.message),
    };
  }

  return { ok: true, data: parsed.output as ModerationRecord };
}

/**
 * Build a patch proposal from an approved (or pending-to-approve) record.
 * Never mutates generated seed, observations, or relationship override files.
 */
export function applyApproved(record: ModerationRecord): WorkflowResult<SeedPatchProposal> {
  if (record.status !== 'approved' && record.status !== 'pending') {
    return {
      ok: false,
      code: 'not_approved',
      message: 'Only pending or approved records can produce a patch proposal.',
    };
  }

  const relationshipOverrides: NonNullable<SeedPatchProposal['relationshipOverrides']> = [];
  const linkSuggestions: NonNullable<SeedPatchProposal['linkSuggestions']> = [];
  const historicalNotes: string[] = [];
  let schoolOrgTextSuggestion: string | null = null;

  for (const change of record.proposedChanges) {
    if (
      (change.kind === 'lineage_confirm' || change.kind === 'lineage_reject') &&
      change.relatedTeamNumber != null
    ) {
      relationshipOverrides.push({
        teamNumberA: record.teamNumber,
        teamNumberB: change.relatedTeamNumber,
        confirmationState: change.kind === 'lineage_confirm' ? 'confirmed' : 'rejected',
        relationshipEvidenceId: change.relationshipEvidenceId ?? null,
        note: change.notes ?? change.value ?? null,
      });
    }

    if (change.kind === 'sister_team' && change.relatedTeamNumber != null) {
      relationshipOverrides.push({
        teamNumberA: record.teamNumber,
        teamNumberB: change.relatedTeamNumber,
        confirmationState: 'confirmed',
        relationshipEvidenceId: change.relationshipEvidenceId ?? null,
        note: change.notes ?? 'Suggested sister team',
      });
    }

    if (change.kind === 'link' && change.value) {
      const type: LinkChangeType = change.linkType ?? 'other';
      linkSuggestions.push({
        type,
        label: change.field?.trim() || type,
        url: change.value,
        confirmationState: 'unconfirmed',
      });
    }

    if (change.kind === 'school_org_text' && change.value) {
      schoolOrgTextSuggestion = change.value;
    }

    if (change.kind === 'historical_note' && change.value) {
      historicalNotes.push(change.value);
    }
  }

  const summaryParts = [
    `Team ${record.teamNumber}`,
    `${record.proposedChanges.length} change(s)`,
    relationshipOverrides.length > 0 ? `${relationshipOverrides.length} relationship override(s)` : null,
    linkSuggestions.length > 0 ? `${linkSuggestions.length} link suggestion(s)` : null,
  ].filter(Boolean);

  const proposal: SeedPatchProposal = {
    kind: 'seed-patch-proposal',
    schemaVersion: TEAM_CORRECTIONS_SCHEMA_VERSION,
    teamNumber: record.teamNumber,
    summary: summaryParts.join(' · '),
    changes: record.proposedChanges,
    evidenceUrls: record.evidenceUrls,
    autoApply: false,
    relationshipOverrides: relationshipOverrides.length > 0 ? relationshipOverrides : undefined,
    linkSuggestions: linkSuggestions.length > 0 ? linkSuggestions : undefined,
    schoolOrgTextSuggestion,
    historicalNotes: historicalNotes.length > 0 ? historicalNotes : undefined,
  };

  return { ok: true, data: proposal };
}

export function approveSubmission(
  record: ModerationRecord,
  options?: { moderatorNote?: string | null; clock?: () => Date },
): WorkflowResult<ModerationRecord> {
  if (record.status !== 'pending') {
    return {
      ok: false,
      code: 'invalid_transition',
      message: `Cannot approve a record in status "${record.status}".`,
    };
  }

  const patchResult = applyApproved({ ...record, status: 'pending' });
  if (!patchResult.ok) {
    return patchResult;
  }

  const clock = options?.clock ?? (() => new Date());
  const moderatedAt = nowIso(clock);
  const next: ModerationRecord = {
    ...record,
    status: 'approved',
    updatedAt: moderatedAt,
    moderatedAt,
    moderatorNote: cleanString(options?.moderatorNote, 1000),
    approvedPatch: patchResult.data,
  };

  const parsed = parseModerationRecord(next);
  if (!parsed.ok) {
    return {
      ok: false,
      code: 'validation',
      message: 'Approved record failed schema validation.',
      issues: parsed.issues.map((issue) => `${issue.path}: ${issue.message}`),
    };
  }

  return { ok: true, data: parsed.data };
}

export function rejectSubmission(
  record: ModerationRecord,
  options?: { moderatorNote?: string | null; clock?: () => Date },
): WorkflowResult<ModerationRecord> {
  if (record.status !== 'pending') {
    return {
      ok: false,
      code: 'invalid_transition',
      message: `Cannot reject a record in status "${record.status}".`,
    };
  }

  const clock = options?.clock ?? (() => new Date());
  const moderatedAt = nowIso(clock);
  const next: ModerationRecord = {
    ...record,
    status: 'rejected',
    updatedAt: moderatedAt,
    moderatedAt,
    moderatorNote: cleanString(options?.moderatorNote, 1000),
    approvedPatch: null,
  };

  const parsed = parseModerationRecord(next);
  if (!parsed.ok) {
    return {
      ok: false,
      code: 'validation',
      message: 'Rejected record failed schema validation.',
      issues: parsed.issues.map((issue) => `${issue.path}: ${issue.message}`),
    };
  }

  return { ok: true, data: parsed.data };
}

/** Stable evidence id for a lineage pair — matches relationship graph edge ids. */
export function lineageRelationshipEvidenceId(
  fromTeamNumber: number,
  relatedTeamNumber: number,
  relationshipType: string,
): string {
  return relatedEdgeId(fromTeamNumber, relatedTeamNumber, relationshipType);
}

export function buildLineageModerationInput(args: {
  teamNumber: number;
  relatedTeamNumber: number;
  relationshipType: string;
  action: 'confirm' | 'reject';
  note?: string | null;
  evidenceUrls?: string[];
}): CorrectionSubmissionInput {
  const evidenceId = lineageRelationshipEvidenceId(
    args.teamNumber,
    args.relatedTeamNumber,
    args.relationshipType,
  );
  return {
    teamNumber: args.teamNumber,
    evidenceUrls: args.evidenceUrls ?? [],
    proposedChanges: [
      {
        kind: args.action === 'confirm' ? 'lineage_confirm' : 'lineage_reject',
        relatedTeamNumber: args.relatedTeamNumber,
        relationshipEvidenceId: evidenceId,
        notes: args.note ?? null,
        value: `${args.action} ${args.relationshipType} with team ${args.relatedTeamNumber}`,
      },
    ],
  };
}

export function exportModerationQueue(
  records: ModerationRecord[],
  clock: () => Date = () => new Date(),
): ModerationQueueDocument {
  return {
    schemaVersion: TEAM_CORRECTIONS_SCHEMA_VERSION,
    exportedAt: nowIso(clock),
    records: [...records],
  };
}

export function formatSubmissionAsGitHubIssueMarkdown(record: ModerationRecord): string {
  const lines: string[] = [
    `## Team correction: ${record.teamNumber}`,
    '',
    `**Record id:** \`${record.id}\``,
    `**Status:** ${record.status}`,
    `**Created:** ${record.createdAt}`,
    '',
    '### Proposed changes',
    '',
  ];

  for (const change of record.proposedChanges) {
    lines.push(
      `- **${change.kind}**` +
        (change.field ? ` · ${change.field}` : '') +
        (change.value ? `: ${change.value}` : '') +
        (change.relatedTeamNumber != null ? ` (related team ${change.relatedTeamNumber})` : '') +
        (change.relationshipEvidenceId ? ` · evidence \`${change.relationshipEvidenceId}\`` : ''),
    );
    if (change.notes) {
      lines.push(`  - Note: ${change.notes}`);
    }
  }

  if (record.evidenceUrls.length > 0) {
    lines.push('', '### Evidence URLs', '');
    for (const url of record.evidenceUrls) {
      lines.push(`- ${url}`);
    }
  }

  if (record.message) {
    lines.push('', '### Submitter message', '', record.message);
  }

  if (record.submitter?.contact || record.submitter?.roleHint) {
    lines.push('', '### Submitter (optional)', '');
    if (record.submitter.roleHint) {
      lines.push(`- Role hint: ${record.submitter.roleHint}`);
    }
    if (record.submitter.contact) {
      lines.push(`- Contact: ${record.submitter.contact}`);
    }
  }

  lines.push(
    '',
    '### Maintainer notes',
    '',
    '- Do **not** auto-merge into generated seed or observations.',
    '- Verify against public sources per `docs/team-corrections.md`.',
    '- If approving lineage, update `teamRelationshipOverrides.json` manually.',
    '',
  );

  if (record.approvedPatch) {
    lines.push('### Approved patch proposal (autoApply: false)', '', '```json');
    lines.push(JSON.stringify(record.approvedPatch, null, 2));
    lines.push('```', '');
  }

  return lines.join('\n');
}

/** Helper for UI rate tips — returns ms remaining before another local submit is advised. */
export function remainingRateTipMs(
  lastSubmittedAtMs: number | null,
  nowMs: number = Date.now(),
  intervalMs: number = CORRECTION_RATE_TIP_MIN_INTERVAL_MS,
): number {
  if (lastSubmittedAtMs == null) {
    return 0;
  }
  return Math.max(0, intervalMs - (nowMs - lastSubmittedAtMs));
}
