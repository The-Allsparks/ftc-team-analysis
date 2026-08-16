import { TeamObservationsData } from './schema';
import { parseTeamObservations, ObservationsIssue } from './teamObservationsSchema';
import { TEAM_OBSERVATIONS_URL, emptyTeamObservations } from '../lib/teamObservations';

export { TEAM_OBSERVATIONS_URL };

export type LoadTeamObservationsResult =
  | { ok: true; data: TeamObservationsData; quarantined: ObservationsIssue[]; missing: boolean }
  | {
      ok: false;
      kind: 'invalid-json' | 'invalid-envelope';
      message: string;
      issues?: ObservationsIssue[];
      diagnostics?: string;
    };

/**
 * Load the append-only observations side store. Missing file (404) is OK —
 * returns an empty store so the directory still loads.
 */
export async function loadTeamObservations(
  url: string = TEAM_OBSERVATIONS_URL,
  fetchImpl: typeof fetch = fetch,
  fallbackRegionCode = 'USNV',
): Promise<LoadTeamObservationsResult> {
  let response: Response;

  try {
    response = await fetchImpl(url);
  } catch {
    return {
      ok: true,
      data: emptyTeamObservations(fallbackRegionCode),
      quarantined: [],
      missing: true,
    };
  }

  if (response.status === 404) {
    return {
      ok: true,
      data: emptyTeamObservations(fallbackRegionCode),
      quarantined: [],
      missing: true,
    };
  }

  if (!response.ok) {
    return {
      ok: true,
      data: emptyTeamObservations(fallbackRegionCode),
      quarantined: [],
      missing: true,
    };
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch (error) {
    return {
      ok: false,
      kind: 'invalid-json',
      message: 'The team observations response was not valid JSON.',
      diagnostics: error instanceof Error ? error.message : String(error),
    };
  }

  const parsed = parseTeamObservations(raw);
  if (!parsed.ok) {
    return {
      ok: false,
      kind: 'invalid-envelope',
      message: 'The team observations file failed validation.',
      issues: parsed.issues,
    };
  }

  return { ok: true, data: parsed.data, quarantined: parsed.quarantined, missing: false };
}
