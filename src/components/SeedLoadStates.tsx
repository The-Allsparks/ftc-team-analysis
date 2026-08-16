import { SeedIssue } from '../data/generatedSeedSchema';
import { RegionIssue } from '../data/regionCatalogSchema';
import { SourceStatusBlock } from './SourceStatusBlock';

export function SeedEnvelopeError({ issues }: { issues: SeedIssue[] }) {
  return (
    <main className="app-shell">
      <h1>Generated seed failed validation</h1>
      <p className="live-status error">
        The Nevada snapshot is not a valid GeneratedData envelope, so the team directory was not loaded.
      </p>
      <ul>
        {issues.map((issue) => (
          <li key={`${issue.path}:${issue.message}:${issue.teamNumber ?? ''}`}>
            {issue.path}: {issue.message}
            {issue.teamNumber !== undefined ? ` (team ${issue.teamNumber})` : ''}
          </li>
        ))}
      </ul>
    </main>
  );
}

export function SeedLoadError({
  message,
  diagnostics,
  issues,
}: {
  message: string;
  diagnostics?: string;
  issues?: SeedIssue[];
}) {
  return (
    <main className="app-shell">
      <h1>Nevada snapshot unavailable</h1>
      <SourceStatusBlock statusClass="live-status error" message={message} diagnostics={diagnostics ?? null} />
      {issues && issues.length > 0 ? (
        <ul>
          {issues.map((issue) => (
            <li key={`${issue.path}:${issue.message}:${issue.teamNumber ?? ''}`}>
              {issue.path}: {issue.message}
              {issue.teamNumber !== undefined ? ` (team ${issue.teamNumber})` : ''}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="empty-note">
        Check your network connection, then reload the page. The app serves the snapshot from{' '}
        <code>/data/nv-ftc-teams.generated.json</code>.
      </p>
    </main>
  );
}

export function SeedLoading() {
  return (
    <main className="app-shell">
      <h1>Loading Nevada FTC teams</h1>
      <p className="empty-note">Downloading the region snapshot…</p>
    </main>
  );
}

export function RegionCatalogEnvelopeError({ issues }: { issues: RegionIssue[] }) {
  return (
    <main className="app-shell">
      <h1>Region catalog failed validation</h1>
      <p className="live-status error">
        The checked-in region catalog is not a valid envelope, so region switching was not loaded.
      </p>
      <ul>
        {issues.map((issue) => (
          <li key={`${issue.path}:${issue.message}:${issue.code ?? ''}`}>
            {issue.path}: {issue.message}
            {issue.code !== undefined ? ` (region ${issue.code})` : ''}
          </li>
        ))}
      </ul>
    </main>
  );
}
