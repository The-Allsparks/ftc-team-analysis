/**
 * Minimal live-refresh guardrails (#89): coalesce identical in-flight proxy fetches
 * and optionally soft-throttle rapid automatic retries. Force/user Refresh should
 * still call through; pass `force: true` to bypass the soft interval.
 */

export const LIVE_REFRESH_MIN_INTERVAL_MS = 5_000;

const inFlight = new Map<string, Promise<unknown>>();
const lastAttemptAt = new Map<string, number>();

/** Share one in-flight promise per key; clears when the promise settles. */
export function coalesceAsync<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = run().finally(() => {
    if (inFlight.get(key) === promise) {
      inFlight.delete(key);
    }
  });

  inFlight.set(key, promise);
  return promise;
}

export function isRefreshThrottled(
  key: string,
  options: { force?: boolean; now?: number; minIntervalMs?: number } = {},
): boolean {
  if (options.force) {
    return false;
  }
  const now = options.now ?? Date.now();
  const minIntervalMs = options.minIntervalMs ?? LIVE_REFRESH_MIN_INTERVAL_MS;
  const last = lastAttemptAt.get(key);
  return last !== undefined && now - last < minIntervalMs;
}

export function markRefreshAttempt(key: string, now: number = Date.now()): void {
  lastAttemptAt.set(key, now);
}

/** Test / hot-reload helper. */
export function resetLiveRefreshGuards(): void {
  inFlight.clear();
  lastAttemptAt.clear();
}
