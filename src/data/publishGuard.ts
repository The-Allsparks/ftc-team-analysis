/**
 * Empty-ingestion publish guard for the checked-in Nevada snapshot.
 *
 * `npm run pull:data` must call {@link assertSafeToPublishGeneratedData} before
 * overwriting `src/data/nv-ftc-teams.generated.json`.
 *
 * Threshold (also documented in README):
 * - Refuse if the candidate is not an object with a `teams` array.
 * - Refuse if `candidate.teams.length === 0`.
 * - Refuse if previous has ≥ {@link PUBLISH_TEAM_DROP_MIN_PREVIOUS} teams and the
 *   candidate count is < {@link PUBLISH_TEAM_DROP_RATIO} of that previous count
 *   (a 50% drop). Exactly 50% is allowed.
 * - If the previous artifact is missing or not a teams-object, skip the drop
 *   check but still refuse empty/invalid candidates.
 */
export const PUBLISH_TEAM_DROP_RATIO = 0.5;
export const PUBLISH_TEAM_DROP_MIN_PREVIOUS = 10;

export const PUBLISH_GUARD_NOT_OBJECT =
  'Candidate generated data is not an object with a teams array.';
export const PUBLISH_GUARD_EMPTY = 'Refusing to publish empty generated data (0 teams).';

export function publishGuardDropMessage(previousCount: number, candidateCount: number): string {
  return `Refusing to publish: team count dropped from ${previousCount} to ${candidateCount} (below 50% of previous when previous ≥ 10 teams).`;
}

export type PublishGuardResult = { ok: true } | { ok: false; reason: string };

function isTeamsObject(value: unknown): value is { teams: unknown[] } {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Array.isArray((value as { teams?: unknown }).teams);
}

export function evaluateGeneratedDataPublish(
  previous: unknown | null,
  candidate: unknown,
): PublishGuardResult {
  if (!isTeamsObject(candidate)) {
    return { ok: false, reason: PUBLISH_GUARD_NOT_OBJECT };
  }

  if (candidate.teams.length === 0) {
    return { ok: false, reason: PUBLISH_GUARD_EMPTY };
  }

  if (isTeamsObject(previous) && previous.teams.length >= PUBLISH_TEAM_DROP_MIN_PREVIOUS) {
    const threshold = previous.teams.length * PUBLISH_TEAM_DROP_RATIO;
    if (candidate.teams.length < threshold) {
      return {
        ok: false,
        reason: publishGuardDropMessage(previous.teams.length, candidate.teams.length),
      };
    }
  }

  return { ok: true };
}

export function assertSafeToPublishGeneratedData(previous: unknown | null, candidate: unknown): void {
  const result = evaluateGeneratedDataPublish(previous, candidate);
  if (!result.ok) {
    throw new Error(result.reason);
  }
}
