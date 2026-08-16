import { describe, expect, it } from 'vitest';
import {
  CORRECTION_RATE_TIP_MIN_INTERVAL_MS,
  applyApproved,
  approveSubmission,
  buildLineageModerationInput,
  createSubmission,
  exportModerationQueue,
  formatSubmissionAsGitHubIssueMarkdown,
  isCorrectionsHash,
  lineageRelationshipEvidenceId,
  rejectSubmission,
  remainingRateTipMs,
} from './teamCorrections';

const fixedClock = () => new Date('2026-08-16T18:00:00.000Z');

function validLinkSubmission() {
  return createSubmission(
    {
      teamNumber: 16158,
      evidenceUrls: ['https://ftc-events.firstinspires.org/2025/team/16158'],
      message: 'Official team site',
      proposedChanges: [
        {
          kind: 'link',
          linkType: 'website',
          field: 'website',
          value: 'https://www.vcsilvercircuits.com',
        },
      ],
      submitter: { roleHint: 'mentor', contact: 'mentor@example.org' },
    },
    { clock: fixedClock, idFactory: () => 'corr-test-1' },
  );
}

describe('teamCorrections workflow', () => {
  it('createSubmission yields a pending moderation record', () => {
    const result = validLinkSubmission();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.status).toBe('pending');
    expect(result.data.teamNumber).toBe(16158);
    expect(result.data.approvedPatch).toBeNull();
    expect(result.data.proposedChanges).toHaveLength(1);
  });

  it('rejects honeypot-filled submissions', () => {
    const result = createSubmission({
      teamNumber: 16158,
      companyUrl: 'https://spam.example',
      proposedChanges: [{ kind: 'historical_note', value: 'noise' }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe('honeypot');
  });

  it('rejects invalid lineage actions without evidence id', () => {
    const result = createSubmission({
      teamNumber: 16158,
      proposedChanges: [
        {
          kind: 'lineage_confirm',
          relatedTeamNumber: 1001,
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe('validation');
    expect(result.issues?.some((issue) => issue.includes('relationshipEvidenceId'))).toBe(true);
  });

  it('approve transitions pending → approved and attaches patch proposal', () => {
    const created = validLinkSubmission();
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const approved = approveSubmission(created.data, {
      moderatorNote: 'Verified on public team page',
      clock: fixedClock,
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) {
      return;
    }
    expect(approved.data.status).toBe('approved');
    expect(approved.data.moderatedAt).toBe('2026-08-16T18:00:00.000Z');
    expect(approved.data.approvedPatch?.autoApply).toBe(false);
    expect(approved.data.approvedPatch?.linkSuggestions).toHaveLength(1);
  });

  it('reject transitions pending → rejected without patch', () => {
    const created = validLinkSubmission();
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const rejected = rejectSubmission(created.data, {
      moderatorNote: 'Could not verify',
      clock: fixedClock,
    });
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) {
      return;
    }
    expect(rejected.data.status).toBe('rejected');
    expect(rejected.data.approvedPatch).toBeNull();
  });

  it('cannot approve or reject non-pending records', () => {
    const created = validLinkSubmission();
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const approved = approveSubmission(created.data, { clock: fixedClock });
    expect(approved.ok).toBe(true);
    if (!approved.ok) {
      return;
    }

    const again = approveSubmission(approved.data);
    expect(again.ok).toBe(false);
    if (again.ok) {
      return;
    }
    expect(again.code).toBe('invalid_transition');

    const rejectAgain = rejectSubmission(approved.data);
    expect(rejectAgain.ok).toBe(false);
    if (rejectAgain.ok) {
      return;
    }
    expect(rejectAgain.code).toBe('invalid_transition');
  });

  it('applyApproved returns a proposal and does not write seed (autoApply false)', () => {
    const created = validLinkSubmission();
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const patch = applyApproved(created.data);
    expect(patch.ok).toBe(true);
    if (!patch.ok) {
      return;
    }
    expect(patch.data.kind).toBe('seed-patch-proposal');
    expect(patch.data.autoApply).toBe(false);
    expect(patch.data.teamNumber).toBe(16158);
    // Record itself unchanged — applyApproved is pure.
    expect(created.data.status).toBe('pending');
    expect(created.data.approvedPatch).toBeNull();
  });

  it('lineage confirm/reject produces relationship override proposals only', () => {
    const input = buildLineageModerationInput({
      teamNumber: 16158,
      relatedTeamNumber: 1001,
      relationshipType: 'sister_team',
      action: 'confirm',
      note: 'Same school concurrent seasons',
    });
    const created = createSubmission(input, { clock: fixedClock, idFactory: () => 'corr-lineage-1' });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const evidenceId = lineageRelationshipEvidenceId(16158, 1001, 'sister_team');
    expect(created.data.proposedChanges[0]?.relationshipEvidenceId).toBe(evidenceId);

    const approved = approveSubmission(created.data, { clock: fixedClock });
    expect(approved.ok).toBe(true);
    if (!approved.ok) {
      return;
    }
    expect(approved.data.approvedPatch?.relationshipOverrides).toEqual([
      {
        teamNumberA: 16158,
        teamNumberB: 1001,
        confirmationState: 'confirmed',
        relationshipEvidenceId: evidenceId,
        note: 'Same school concurrent seasons',
      },
    ]);
    expect(approved.data.approvedPatch?.autoApply).toBe(false);
  });

  it('lineage reject proposal uses rejected confirmationState', () => {
    const input = buildLineageModerationInput({
      teamNumber: 2000,
      relatedTeamNumber: 2001,
      relationshipType: 'possible_related',
      action: 'reject',
    });
    const created = createSubmission(input, { clock: fixedClock, idFactory: () => 'corr-lineage-2' });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const approved = approveSubmission(created.data, { clock: fixedClock });
    expect(approved.ok).toBe(true);
    if (!approved.ok) {
      return;
    }
    expect(approved.data.approvedPatch?.relationshipOverrides?.[0]?.confirmationState).toBe(
      'rejected',
    );
  });

  it('exports queue JSON and GitHub issue markdown without seed mutation flags', () => {
    const created = validLinkSubmission();
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const approved = approveSubmission(created.data, { clock: fixedClock });
    expect(approved.ok).toBe(true);
    if (!approved.ok) {
      return;
    }

    const doc = exportModerationQueue([approved.data], fixedClock);
    expect(doc.schemaVersion).toBe(1);
    expect(doc.records).toHaveLength(1);
    expect(doc.exportedAt).toBe('2026-08-16T18:00:00.000Z');

    const markdown = formatSubmissionAsGitHubIssueMarkdown(approved.data);
    expect(markdown).toContain('Team correction: 16158');
    expect(markdown).toContain('auto-merge');
    expect(markdown).toContain('"autoApply": false');
  });

  it('rate tip helper and corrections hash helpers work', () => {
    expect(remainingRateTipMs(null)).toBe(0);
    expect(remainingRateTipMs(1_000, 1_000 + CORRECTION_RATE_TIP_MIN_INTERVAL_MS - 5_000)).toBe(
      5_000,
    );
    expect(isCorrectionsHash('#corrections')).toBe(true);
    expect(isCorrectionsHash('#/corrections')).toBe(true);
    expect(isCorrectionsHash('#health')).toBe(false);
  });
});
