import {
  SEASON_COUNT_DROP_HIGHLIGHT_RATIO,
  SourceHealthReport,
  formatSeedAge,
} from '../lib/sourceHealthReport';

export type SourceHealthDashboardProps = {
  report: SourceHealthReport;
  onBack: () => void;
};

function pct(part: number, whole: number): string {
  if (whole <= 0) {
    return '—';
  }
  return `${Math.round((part / whole) * 1000) / 10}%`;
}

export function SourceHealthDashboard({ report, onBack }: SourceHealthDashboardProps) {
  const region = report.regionLabel ?? report.regionCode;

  return (
    <section className="source-health" aria-label="Data health dashboard">
      <div className="source-health-header">
        <div>
          <p className="eyebrow">Maintainer view</p>
          <h1>Data health</h1>
          <p className="hero-copy">
            Snapshot and session source status for {region}. This view does not refresh upstreams; it
            reports the loaded seed and live statuses already observed in this browser session.
          </p>
        </div>
        <button type="button" onClick={onBack}>
          Back to directory
        </button>
      </div>

      <section className="stats-grid" aria-label="Snapshot summary">
        <article>
          <span>{report.teamCount}</span>
          <p>teams in snapshot</p>
        </article>
        <article>
          <span>{report.seasonRowCount}</span>
          <p>team-season rows</p>
        </article>
        <article>
          <span>{report.regionEventCount}</span>
          <p>region events</p>
        </article>
        <article className={report.seedStale ? 'health-alert' : undefined}>
          <span>{formatSeedAge(report.seedAgeMs)}</span>
          <p>{report.seedStale ? 'seed age (stale >8d)' : 'seed age'}</p>
        </article>
      </section>

      <p className="health-meta">
        Generated {report.generatedAt}
        {report.seedStale ? ' — snapshot is older than 8 days.' : '.'}
      </p>

      {report.lastSeenTeamCountDelta ? (
        <p
          className={
            report.lastSeenTeamCountDelta.highlighted ? 'health-callout health-alert' : 'health-callout'
          }
        >
          Team count since last visit: {report.lastSeenTeamCountDelta.previousCount} →{' '}
          {report.lastSeenTeamCountDelta.currentCount} (Δ {report.lastSeenTeamCountDelta.delta}
          {report.lastSeenTeamCountDelta.highlighted ? ', highlighted drop' : ''}).
          Multi-refresh history remains in scheduled change reports / issue #29.
        </p>
      ) : (
        <p className="health-callout">
          No prior visit team count in this browser yet. Season-over-season deltas below use the
          current seed only; refresh-to-refresh history is tracked in Actions reports and #29.
        </p>
      )}

      <section className="health-panel" aria-label="Ingestion source checks">
        <h2>Ingestion source checks</h2>
        {report.sourceChecks.length === 0 ? (
          <p className="empty-note">No `sourceChecks` on this snapshot.</p>
        ) : (
          <table className="health-table">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Checked</th>
                <th scope="col">Status</th>
                <th scope="col">Detail</th>
              </tr>
            </thead>
            <tbody>
              {report.sourceChecks.map((check) => (
                <tr key={`${check.label}:${check.checkedAt}`} className={check.ok ? undefined : 'health-alert'}>
                  <td>
                    <a href={check.url} target="_blank" rel="noreferrer">
                      {check.label}
                    </a>
                  </td>
                  <td>{check.checkedAt}</td>
                  <td>{check.ok ? 'ok' : 'failed'}</td>
                  <td>{check.detail ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {report.sourceCheckFailures.length > 0 ? (
          <p className="health-alert-text">
            {report.sourceCheckFailures.length} ingestion source check(s) failed at pull time.
          </p>
        ) : null}
      </section>

      <section className="health-panel" aria-label="Season coverage">
        <h2>Coverage by season</h2>
        <p className="health-meta">
          Missing fields: website {report.missingWebsiteTotal}, organization{' '}
          {report.missingOrganizationTotal}, location {report.missingLocationTotal}.
        </p>
        <table className="health-table">
          <thead>
            <tr>
              <th scope="col">Season</th>
              <th scope="col">Teams</th>
              <th scope="col">Missing website</th>
              <th scope="col">Missing org</th>
              <th scope="col">Missing location</th>
            </tr>
          </thead>
          <tbody>
            {report.coverageBySeason.map((row) => (
              <tr key={row.season}>
                <td>{row.season}</td>
                <td>{row.teamCount}</td>
                <td>
                  {row.missingWebsite} ({pct(row.missingWebsite, row.teamCount)})
                </td>
                <td>
                  {row.missingOrganization} ({pct(row.missingOrganization, row.teamCount)})
                </td>
                <td>
                  {row.missingLocation} ({pct(row.missingLocation, row.teamCount)})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="health-panel" aria-label="Season count deltas">
        <h2>Season-over-season team counts</h2>
        {report.seasonCountDeltas.length === 0 ? (
          <p className="empty-note">Not enough seasons to compare.</p>
        ) : (
          <table className="health-table">
            <thead>
              <tr>
                <th scope="col">From → to</th>
                <th scope="col">Counts</th>
                <th scope="col">Δ</th>
                <th scope="col">Note</th>
              </tr>
            </thead>
            <tbody>
              {report.seasonCountDeltas.map((row) => (
                <tr
                  key={`${row.fromSeason}-${row.toSeason}`}
                  className={row.highlighted ? 'health-alert' : undefined}
                >
                  <td>
                    {row.fromSeason} → {row.toSeason}
                  </td>
                  <td>
                    {row.fromCount} → {row.toCount}
                  </td>
                  <td>{row.delta}</td>
                  <td>
                    {row.highlighted
                      ? `Highlighted drop (≥${Math.round(SEASON_COUNT_DROP_HIGHLIGHT_RATIO * 100)}%)`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="health-panel health-grid" aria-label="Provenance and relationships">
        <div>
          <h2>Affiliations</h2>
          <ul className="health-list">
            <li>High confidence: {report.affiliationConfidence.high}</li>
            <li>Medium confidence: {report.affiliationConfidence.medium}</li>
            <li>Low confidence: {report.affiliationConfidence.low}</li>
          </ul>
        </div>
        <div>
          <h2>Evidence</h2>
          <ul className="health-list">
            <li>Season rows with evidence: {report.evidence.seasonRowsWithEvidence}</li>
            <li>Conflicting observations: {report.evidence.conflictingObservations}</li>
            <li>Unconfirmed observations: {report.evidence.unconfirmedObservations}</li>
          </ul>
        </div>
        <div>
          <h2>Relationships</h2>
          <ul className="health-list">
            <li>Unverified inferred pairs: {report.unverifiedRelationshipCount}</li>
          </ul>
        </div>
      </section>

      <section className="health-panel" aria-label="Session live sources">
        <h2>Session live sources</h2>
        <p className="health-meta">
          Statuses from this session only (FTC Events refresh, FTCScout, Portfolio Lab, avatars). Opening
          this page does not probe upstreams.
        </p>
        {report.liveSources.length === 0 ? (
          <p className="empty-note">No live source snapshots provided.</p>
        ) : (
          <table className="health-table">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Session</th>
                <th scope="col">SourceResult</th>
                <th scope="col">Message</th>
              </tr>
            </thead>
            <tbody>
              {report.liveSources.map((row) => {
                const failed =
                  row.sessionStatus === 'error' ||
                  row.sourceState === 'network_failure' ||
                  row.sourceState === 'proxy_failure' ||
                  row.sourceState === 'parse_failure' ||
                  row.sourceState === 'rate_limited' ||
                  row.sourceState === 'auth_failure' ||
                  row.sourceState === 'upstream_unavailable';
                return (
                  <tr key={row.id} className={failed ? 'health-alert' : undefined}>
                    <td>{row.label}</td>
                    <td>{row.sessionStatus}</td>
                    <td>{row.sourceState ?? '—'}</td>
                    <td>
                      {row.message ?? '—'}
                      {row.diagnostics ? (
                        <details className="source-diagnostics">
                          <summary>Technical details</summary>
                          <pre>{row.diagnostics}</pre>
                        </details>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {report.liveFailureCount > 0 ? (
          <p className="health-alert-text">{report.liveFailureCount} live source(s) in a failure state.</p>
        ) : null}
      </section>
    </section>
  );
}
