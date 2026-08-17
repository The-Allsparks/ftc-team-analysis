import { GeneratedData } from './schema';
import { parseGeneratedSeed, SeedIssue } from './generatedSeedSchema';

/** Transitional mega-seed path; split tree lives alongside under /data/ (see docs/snapshot-tree.md). */
export const GENERATED_SEED_URL = '/data/nv-ftc-teams.generated.json';

export type LoadGeneratedSeedResult =
  | { ok: true; data: GeneratedData; quarantined: SeedIssue[] }
  | {
      ok: false;
      kind: 'network' | 'invalid-json' | 'invalid-envelope';
      message: string;
      issues?: SeedIssue[];
      diagnostics?: string;
    };

function isLikelyOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export async function loadGeneratedSeed(
  url: string = GENERATED_SEED_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<LoadGeneratedSeedResult> {
  let response: Response;

  try {
    response = await fetchImpl(url);
  } catch (error) {
    return {
      ok: false,
      kind: 'network',
      message: isLikelyOffline()
        ? 'You appear to be offline, so the Nevada team snapshot could not be loaded.'
        : 'Could not download the Nevada team snapshot.',
      diagnostics: error instanceof Error ? error.message : String(error),
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      kind: 'network',
      message: isLikelyOffline()
        ? 'You appear to be offline, so the Nevada team snapshot could not be loaded.'
        : `Could not download the Nevada team snapshot (HTTP ${response.status}).`,
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
      message: 'The Nevada team snapshot response was not valid JSON.',
      diagnostics: error instanceof Error ? error.message : String(error),
    };
  }

  const parsed = parseGeneratedSeed(raw);

  if (!parsed.ok) {
    return {
      ok: false,
      kind: 'invalid-envelope',
      message:
        'The Nevada team snapshot failed validation, so the team directory was not loaded.',
      issues: parsed.issues,
    };
  }

  return { ok: true, data: parsed.data, quarantined: parsed.quarantined };
}
