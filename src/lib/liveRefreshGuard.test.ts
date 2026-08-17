import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  coalesceAsync,
  isRefreshThrottled,
  markRefreshAttempt,
  resetLiveRefreshGuards,
} from './liveRefreshGuard';

describe('liveRefreshGuard', () => {
  afterEach(() => {
    resetLiveRefreshGuards();
    vi.useRealTimers();
  });

  it('coalesces identical in-flight keys into one run', async () => {
    let runs = 0;
    const run = () =>
      coalesceAsync('k', async () => {
        runs += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return 'ok';
      });

    const [a, b] = await Promise.all([run(), run()]);
    expect(a).toBe('ok');
    expect(b).toBe('ok');
    expect(runs).toBe(1);
  });

  it('allows a new run after the previous promise settles', async () => {
    let runs = 0;
    const run = () =>
      coalesceAsync('k', async () => {
        runs += 1;
        return runs;
      });

    expect(await run()).toBe(1);
    expect(await run()).toBe(2);
  });

  it('soft-throttles automatic retries but not force', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    markRefreshAttempt('region:USNV');
    expect(isRefreshThrottled('region:USNV')).toBe(true);
    expect(isRefreshThrottled('region:USNV', { force: true })).toBe(false);

    vi.setSystemTime(1_000_000 + 5_000);
    expect(isRefreshThrottled('region:USNV')).toBe(false);
  });
});
