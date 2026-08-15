import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCached } from './ftcCache';
import { avatarCssCacheKeyForTests, fetchComposedAvatarCss, resolveTeamAvatarUrl } from './teamAvatar';

function installMemoryLocalStorage() {
  const store = new Map<string, string>();

  vi.stubGlobal('localStorage', {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    get length() {
      return store.size;
    },
  });
}

describe('fetchComposedAvatarCss', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not cache 429/5xx failures; treats 404 as no_record', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('missing', { status: 404 }));
    const missing = await fetchComposedAvatarCss(2026, { force: true });
    expect(missing.ok).toBe(true);
    if (missing.ok) {
      expect(missing.state).toBe('no_record');
    }
    // Legitimate empty catalog is not written as a successful stylesheet cache entry.
    expect(getCached(avatarCssCacheKeyForTests(2026), 60_000)).toBeNull();

    for (const status of [429, 503]) {
      vi.mocked(fetch).mockResolvedValue(new Response('nope', { status }));
      const result = await fetchComposedAvatarCss(2026, { force: true });
      expect(result.ok).toBe(false);
      expect(getCached(avatarCssCacheKeyForTests(2026), 60_000)).toBeNull();
      if (!result.ok) {
        expect(result.state).toBe(status === 429 ? 'rate_limited' : 'upstream_unavailable');
      }
    }
  });

  it('returns no_record for a team without collapsing catalog failure', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('.team-1 { background-image: url("/avatars/1.png"); }', {
        status: 200,
        headers: { 'content-type': 'text/css' },
      }),
    );

    const missing = await resolveTeamAvatarUrl(2025, 99999, { force: true });
    expect(missing.ok).toBe(true);
    if (missing.ok) {
      expect(missing.state).toBe('no_record');
      expect(missing.data).toBeNull();
    }

    vi.mocked(fetch).mockResolvedValue(new Response('down', { status: 500 }));
    const failed = await resolveTeamAvatarUrl(2025, 1, { force: true });
    expect(failed.ok).toBe(false);
    if (!failed.ok) {
      expect(failed.state).toBe('upstream_unavailable');
    }
  });
});
