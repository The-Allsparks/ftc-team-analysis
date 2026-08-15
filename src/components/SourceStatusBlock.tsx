export function SourceStatusBlock({
  statusClass,
  message,
  diagnostics,
}: {
  statusClass: string;
  message: string | null;
  diagnostics?: string | null;
}) {
  if (!message) {
    return null;
  }

  return (
    <div className="source-status-block">
      <p className={statusClass}>{message}</p>
      {diagnostics ? (
        <details className="source-diagnostics">
          <summary>Technical details</summary>
          <pre>{diagnostics}</pre>
        </details>
      ) : null}
    </div>
  );
}
