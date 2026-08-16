import { FormEvent, useState } from 'react';
import type { CorrectionChangeKind, LinkChangeType, ModerationRecord } from '../data/teamCorrectionsSchema';
import {
  CORRECTION_RATE_TIP_MIN_INTERVAL_MS,
  createSubmission,
  remainingRateTipMs,
} from '../lib/teamCorrections';

const LINK_TYPES: LinkChangeType[] = [
  'website',
  'social',
  'code',
  'video',
  'cad',
  'docs',
  'community',
  'other',
];

type CorrectionSubmissionFormProps = {
  teamNumber: number;
  onSubmitted: (record: ModerationRecord) => void;
};

type FormMode = 'link' | 'school_org_text' | 'historical_note' | 'sister_team';

export function CorrectionSubmissionForm({ teamNumber, onSubmitted }: CorrectionSubmissionFormProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<FormMode>('link');
  const [linkType, setLinkType] = useState<LinkChangeType>('website');
  const [value, setValue] = useState('');
  const [relatedTeamNumber, setRelatedTeamNumber] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [message, setMessage] = useState('');
  const [roleHint, setRoleHint] = useState('');
  const [contact, setContact] = useState('');
  const [companyUrl, setCompanyUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [rateTip, setRateTip] = useState<string | null>(null);
  const [lastSubmittedAt, setLastSubmittedAt] = useState<number | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  function resetFields() {
    setValue('');
    setRelatedTeamNumber('');
    setEvidenceUrl('');
    setMessage('');
    setCompanyUrl('');
    setError(null);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccessId(null);

    const remaining = remainingRateTipMs(lastSubmittedAt);
    if (remaining > 0) {
      const seconds = Math.ceil(remaining / 1000);
      setRateTip(
        `Please wait about ${seconds}s before another local submission (spam tip; not server-enforced).`,
      );
      return;
    }
    setRateTip(null);

    const kind = mode as CorrectionChangeKind;
    const related = relatedTeamNumber.trim() ? Number(relatedTeamNumber) : null;
    const proposedChanges =
      kind === 'link'
        ? [{ kind, linkType, field: linkType, value: value.trim() }]
        : kind === 'sister_team'
          ? [
              {
                kind,
                relatedTeamNumber: related,
                value: value.trim() || `Suggested sister team ${related ?? ''}`.trim(),
                notes: message.trim() || null,
              },
            ]
          : [{ kind, field: kind === 'school_org_text' ? 'organization' : 'historical', value: value.trim() }];

    const result = createSubmission({
      teamNumber,
      proposedChanges,
      evidenceUrls: evidenceUrl.trim() ? [evidenceUrl.trim()] : [],
      message: message.trim() || null,
      submitter: {
        roleHint: roleHint.trim() || null,
        contact: contact.trim() || null,
      },
      companyUrl,
    });

    if (!result.ok) {
      setError(result.issues?.join(' ') || result.message);
      return;
    }

    onSubmitted(result.data);
    setLastSubmittedAt(Date.now());
    setSuccessId(result.data.id);
    resetFields();
  }

  return (
    <section className="corrections-panel" aria-label="Suggest a correction">
      <div className="section-heading">
        <h3>Suggest a correction</h3>
        <button type="button" className="corrections-toggle" onClick={() => setOpen((value) => !value)}>
          {open ? 'Hide form' : 'Open form'}
        </button>
      </div>
      <p className="corrections-note">
        Submissions create a reviewable moderation record in this browser. They never overwrite sourced
        seed or observations. Prefer public evidence links. Do not include student PII. Details:{' '}
        <a href="https://github.com/The-Allsparks/ftc-team-analysis/blob/main/docs/team-corrections.md">
          verification standards
        </a>
        .
      </p>

      {open && (
        <form className="corrections-form" onSubmit={handleSubmit} noValidate>
          <label>
            Correction type
            <select value={mode} onChange={(event) => setMode(event.target.value as FormMode)}>
              <option value="link">Add / correct a public link</option>
              <option value="school_org_text">School / organization text</option>
              <option value="sister_team">Identify a sister team</option>
              <option value="historical_note">Historical note</option>
            </select>
          </label>

          {mode === 'link' && (
            <label>
              Link type
              <select
                value={linkType}
                onChange={(event) => setLinkType(event.target.value as LinkChangeType)}
              >
                {LINK_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
          )}

          {mode === 'sister_team' ? (
            <label>
              Related team number
              <input
                type="number"
                min={1}
                inputMode="numeric"
                value={relatedTeamNumber}
                onChange={(event) => setRelatedTeamNumber(event.target.value)}
                required
              />
            </label>
          ) : (
            <label>
              {mode === 'link' ? 'URL' : 'Proposed text'}
              <input
                type={mode === 'link' ? 'url' : 'text'}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                required
                placeholder={mode === 'link' ? 'https://…' : 'Publicly verifiable correction'}
              />
            </label>
          )}

          <label>
            Public evidence URL (recommended)
            <input
              type="url"
              value={evidenceUrl}
              onChange={(event) => setEvidenceUrl(event.target.value)}
              placeholder="https://ftc-events.firstinspires.org/…"
            />
          </label>

          <label>
            Message for maintainers (optional)
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={3}
              maxLength={2000}
            />
          </label>

          <div className="corrections-contact-row">
            <label>
              Role hint (optional)
              <input
                type="text"
                value={roleHint}
                onChange={(event) => setRoleHint(event.target.value)}
                placeholder="mentor, coach, alumni…"
                maxLength={40}
                autoComplete="off"
              />
            </label>
            <label>
              Contact (optional)
              <input
                type="text"
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                placeholder="email or GitHub handle"
                maxLength={120}
                autoComplete="off"
              />
            </label>
          </div>

          {/* Honeypot: hidden from users; bots that fill it are rejected. */}
          <label className="corrections-honeypot" aria-hidden="true">
            Company website
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={companyUrl}
              onChange={(event) => setCompanyUrl(event.target.value)}
            />
          </label>

          {error && <p className="corrections-error">{error}</p>}
          {rateTip && <p className="corrections-rate-tip">{rateTip}</p>}
          {successId && (
            <p className="corrections-success">
              Saved pending record <code>{successId}</code>. Export from the moderation queue (
              <a href="#corrections">#corrections</a>) or copy as a GitHub issue.
            </p>
          )}

          <div className="corrections-actions">
            <button type="submit">Submit for review</button>
            <small>
              Soft rate tip: ~{Math.round(CORRECTION_RATE_TIP_MIN_INTERVAL_MS / 1000)}s between local
              submits. No server store in this MVP.
            </small>
          </div>
        </form>
      )}
    </section>
  );
}
