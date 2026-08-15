import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENERATED_SEED_URL, loadGeneratedSeed } from './loadGeneratedSeed';

const SEED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'nv-ftc-teams.generated.json');

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('loadGeneratedSeed', () => {
  it('loads and validates a GeneratedData envelope from fetch', async () => {
    const raw = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
    const fetchImpl = vi.fn(async () => jsonResponse(raw));

    const result = await loadGeneratedSeed(GENERATED_SEED_URL, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith(GENERATED_SEED_URL);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.quarantined).toEqual([]);
    expect(result.data.teams.length).toBeGreaterThan(0);
  });

  it('returns a network failure when fetch throws', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    const result = await loadGeneratedSeed(GENERATED_SEED_URL, fetchImpl);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.kind).toBe('network');
    expect(result.message).toMatch(/offline|Could not download/i);
    expect(result.diagnostics).toContain('Failed to fetch');
  });

  it('returns a network failure for non-OK HTTP status', async () => {
    const fetchImpl = vi.fn(async () => new Response('missing', { status: 404, statusText: 'Not Found' }));

    const result = await loadGeneratedSeed(GENERATED_SEED_URL, fetchImpl);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.kind).toBe('network');
    expect(result.message).toContain('404');
  });

  it('returns invalid-json when the body is not JSON', async () => {
    const fetchImpl = vi.fn(async () => new Response('not-json', { status: 200 }));

    const result = await loadGeneratedSeed(GENERATED_SEED_URL, fetchImpl);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.kind).toBe('invalid-json');
  });

  it('returns invalid-envelope when JSON fails seed validation', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ teams: 'nope' }));

    const result = await loadGeneratedSeed(GENERATED_SEED_URL, fetchImpl);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.kind).toBe('invalid-envelope');
    expect(result.issues?.length).toBeGreaterThan(0);
  });
});
