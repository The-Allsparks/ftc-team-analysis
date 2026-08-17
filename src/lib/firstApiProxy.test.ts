import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FIRST_API_PROXY_BAD_REQUEST,
  FIRST_API_PROXY_CREDENTIALS_ABSENT,
  FIRST_API_PROXY_METHOD_NOT_ALLOWED,
  FIRST_API_PROXY_PREFIX,
  credentialsFromProxyEnv,
  handleFirstApiProxyRequest,
  isFirstApiProxyPath,
  resolveFirstApiProxyRequest,
} from './firstApiProxy';

const env = { FIRST_API_USERNAME: 'api-user', FIRST_API_TOKEN: 'api-token' };

describe('resolveFirstApiProxyRequest', () => {
  it('maps allowlisted /v2.0 paths onto ftc-api.firstinspires.org', () => {
    expect(resolveFirstApiProxyRequest('/ftc-api-proxy/2026/awards/12777')?.upstreamUrl.toString()).toBe(
      'https://ftc-api.firstinspires.org/v2.0/2026/awards/12777',
    );
    expect(resolveFirstApiProxyRequest('/ftc-api-proxy/2026/rankings/USNVCMP', '?page=1')?.upstreamUrl.toString()).toBe(
      'https://ftc-api.firstinspires.org/v2.0/2026/rankings/USNVCMP?page=1',
    );
  });

  it('rejects non-allowlisted, smuggled, or public HTML-proxy paths', () => {
    expect(resolveFirstApiProxyRequest('/ftc-api-proxy/not-a-real-endpoint')).toBeNull();
    expect(resolveFirstApiProxyRequest('/ftc-api-proxy/https://evil.example')).toBeNull();
    expect(resolveFirstApiProxyRequest('/ftc-api-proxy/../secret')).toBeNull();
    expect(isFirstApiProxyPath('/ftc-proxy/2026/team/1')).toBe(false);
    expect(isFirstApiProxyPath(FIRST_API_PROXY_PREFIX)).toBe(true);
  });
});

describe('credentialsFromProxyEnv', () => {
  it('requires both username and token', () => {
    expect(credentialsFromProxyEnv(undefined)).toBeNull();
    expect(credentialsFromProxyEnv({ FIRST_API_USERNAME: 'x' })).toBeNull();
    expect(credentialsFromProxyEnv({ FIRST_API_TOKEN: 'y' })).toBeNull();
    expect(credentialsFromProxyEnv(env)).toEqual({ username: 'api-user', token: 'api-token' });
  });
});

describe('handleFirstApiProxyRequest', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 503 without leaking a call when secrets are absent', async () => {
    const fetchImpl = vi.fn();
    const response = await handleFirstApiProxyRequest(
      new Request('https://app.example/ftc-api-proxy/2026/awards/12777'),
      {},
      fetchImpl as unknown as typeof fetch,
    );
    expect(response.status).toBe(503);
    expect(await response.text()).toBe(FIRST_API_PROXY_CREDENTIALS_ABSENT);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('injects Basic auth from env and strips browser Authorization', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe(`Basic ${btoa('api-user:api-token')}`);
      expect(headers.get('User-Agent')).toBe('Nevada-FTC-Team-Explorer-first-api');
      expect(headers.has('cookie')).toBe(false);
      return new Response('{"awards":[]}', { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const response = await handleFirstApiProxyRequest(
      new Request('https://app.example/ftc-api-proxy/2026/awards/12777', {
        headers: {
          Authorization: 'Bearer stolen',
          cookie: 'session=1',
          Accept: 'application/json',
        },
      }),
      env,
      fetchImpl as unknown as typeof fetch,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://ftc-api.firstinspires.org/v2.0/2026/awards/12777',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('rejects POST and unknown paths', async () => {
    const post = await handleFirstApiProxyRequest(
      new Request('https://app.example/ftc-api-proxy/2026/awards/12777', { method: 'POST' }),
      env,
      vi.fn() as unknown as typeof fetch,
    );
    expect(post.status).toBe(405);
    expect(await post.text()).toBe(FIRST_API_PROXY_METHOD_NOT_ALLOWED);

    const bad = await handleFirstApiProxyRequest(
      new Request('https://app.example/ftc-api-proxy/nope'),
      env,
    );
    expect(bad.status).toBe(400);
    expect(await bad.text()).toBe(FIRST_API_PROXY_BAD_REQUEST);
  });
});
