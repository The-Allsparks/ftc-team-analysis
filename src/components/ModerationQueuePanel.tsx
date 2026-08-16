import { useMemo, useState } from 'react';
import type { ModerationRecord } from '../data/teamCorrectionsSchema';
import {
  exportModerationQueue,
  formatSubmissionAsGitHubIssueMarkdown,
} from '../lib/teamCorrections';

export type ModerationQueuePanelProps = {
  records: ModerationRecord[];
  pendingCount: number;
  onApprove: (id: string, note?: string | null) => { ok: boolean; message?: string };
  onReject: (id: string, note?: string | null) => { ok: boolean; message?: string };
  onClear: () => void;
  onClose: () => void;
};

export function ModerationQueuePanel({
  records,
  pendingCount,
  onApprove,
  onReject,
  onClear,
  onClose,
}: ModerationQueuePanelProps) {
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [note, setNote] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const visible = useMemo(
    () => (filter === 'pending' ? records.filter((row) => row.status === 'pending') : records),
    [filter, records],
  );

  async function copyMarkdown(record: ModerationRecord) {
    const markdown = formatSubmissionAsGitHubIssueMarkdown(record);
    try {
      await navigator.clipboard.writeText(markdown);
      setCopiedId(record.id);
      setActionMessage('Copied GitHub-issue markdown to clipboard.');
    } catch {
      setActionMessage('Clipboard unavailable — use Download JSON instead.');
    }
  }

  function downloadJson() {
    const doc = exportModerationQueue(records);
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ftc-moderation-queue-${doc.exportedAt.slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setActionMessage('Downloaded moderation queue JSON (reviewable export only).');
  }

  return (
    <section className="moderation-queue-panel" aria-label="Correction moderation queue">
      <div className="detail-header">
        <div>
          <p className="eyebrow">Maintainer tools</p>
          <h2>Correction moderation</h2>
          <p className="moderation-queue-lead">
            Local browser queue only. Approving builds a patch proposal with{' '}
            <code>autoApply: false</code> — sourced seed and observations are never overwritten here.
            Export JSON or copy GitHub-issue markdown for durable review.
          </p>
        </div>
        <div className="detail-actions">
          <button type="button" onClick={downloadJson} disabled={records.length === 0}>
            Download JSON
          </button>
          <button type="button" onClick={onClear} disabled={records.length === 0}>
            Clear local queue
          </button>
          <button type="button" onClick={onClose}>
            Back to directory
          </button>
        </div>
      </div>

      <div className="moderation-toolbar">
        <label>
          Show
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as 'pending' | 'all')}
          >
            <option value="pending">Pending ({pendingCount})</option>
            <option value="all">All ({records.length})</option>
          </select>
        </label>
        <label>
          Moderator note (applied on next approve/reject)
          <input
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Verified on FTC Events…"
            maxLength={1000}
          />
        </label>
      </div>

      {actionMessage && <p className="moderation-action-message">{actionMessage}</p>}

      {visible.length === 0 ? (
        <p className="empty-note">
          No {filter === 'pending' ? 'pending ' : ''}correction records in this browser yet. Use
          “Suggest a correction” on a team detail panel.
        </p>
      ) : (
        <ul className="moderation-list">
          {visible.map((record) => (
            <li key={record.id} className={`moderation-card status-${record.status}`}>
              <div className="moderation-card-header">
                <strong>
                  Team {record.teamNumber} · {record.status}
                </strong>
                <span>{record.createdAt.slice(0, 19).replace('T', ' ')}Z</span>
              </div>
              <p className="moderation-id">
                <code>{record.id}</code>
              </p>
              <ul className="moderation-changes">
                {record.proposedChanges.map((change, index) => (
                  <li key={`${record.id}-${index}`}>
                    <strong>{change.kind}</strong>
                    {change.value ? `: ${change.value}` : ''}
                    {change.relatedTeamNumber != null
                      ? ` · related ${change.relatedTeamNumber}`
                      : ''}
                    {change.relationshipEvidenceId
                      ? ` · ${change.relationshipEvidenceId}`
                      : ''}
                  </li>
                ))}
              </ul>
              {record.evidenceUrls.length > 0 && (
                <p className="moderation-evidence">
                  Evidence:{' '}
                  {record.evidenceUrls.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      {url}
                    </a>
                  ))}
                </p>
              )}
              {record.approvedPatch && (
                <p className="moderation-patch-note">
                  Patch proposal ready · autoApply={String(record.approvedPatch.autoApply)} ·{' '}
                  {record.approvedPatch.summary}
                </p>
              )}
              <div className="moderation-card-actions">
                <button
                  type="button"
                  disabled={record.status !== 'pending'}
                  onClick={() => {
                    const result = onApprove(record.id, note.trim() || null);
                    setActionMessage(
                      result.ok
                        ? 'Approved — patch proposal attached; seed not written.'
                        : result.message ?? 'Approve failed.',
                    );
                  }}
                >
                  Approve (proposal only)
                </button>
                <button
                  type="button"
                  disabled={record.status !== 'pending'}
                  onClick={() => {
                    const result = onReject(record.id, note.trim() || null);
                    setActionMessage(result.ok ? 'Rejected.' : result.message ?? 'Reject failed.');
                  }}
                >
                  Reject
                </button>
                <button type="button" onClick={() => void copyMarkdown(record)}>
                  {copiedId === record.id ? 'Copied markdown' : 'Copy GitHub issue'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
