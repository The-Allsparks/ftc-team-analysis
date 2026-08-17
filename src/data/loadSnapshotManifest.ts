/**
 * Optional helper for future loaders (#88): fetch + validate `/data/manifest.json`.
 * The app still loads the mega-seed today; this does not change App.tsx.
 */
import {
  parseSnapshotManifest,
  type SnapshotManifest,
  type SnapshotParseIssue,
} from './snapshotTreeSchema';

export const SNAPSHOT_MANIFEST_URL = '/data/manifest.json';

export type LoadSnapshotManifestResult =
  | { ok: true; data: SnapshotManifest }
  | {
      ok: false;
      kind: 'network' | 'invalid-json' | 'invalid-envelope';
      message: string;
      issues?: SnapshotParseIssue[];
      diagnostics?: string;
    };

export async function loadSnapshotManifest(
  url: string = SNAPSHOT_MANIFEST_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<LoadSnapshotManifestResult> {
  let response: Response;

  try {
    response = await fetchImpl(url);
  } catch (error) {
    return {
      ok: false,
      kind: 'network',
      message: 'Could not download the snapshot manifest.',
      diagnostics: error instanceof Error ? error.message : String(error),
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      kind: 'network',
      message: `Could not download the snapshot manifest (HTTP ${response.status}).`,
      diagnostics: `GET ${url} → ${response.status} ${response.statusText}`,
    };
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch (error) {
    return {
      ok: false,
      kind: 'invalid-json',
      message: 'The snapshot manifest response was not valid JSON.',
      diagnostics: error instanceof Error ? error.message : String(error),
    };
  }

  const parsed = parseSnapshotManifest(raw);
  if (!parsed.ok) {
    return {
      ok: false,
      kind: 'invalid-envelope',
      message: 'The snapshot manifest failed validation.',
      issues: parsed.issues,
    };
  }

  return { ok: true, data: parsed.data };
}
