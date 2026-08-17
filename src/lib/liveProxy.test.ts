import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LIVE_PROXY_BAD_REQUEST,
  LIVE_PROXY_ROUTES,
  LIVE_PROXY_TIMEOUT_MS,
  LIVE_PROXY_UPSTREAM_TIMEOUT,
  LIVE_PROXY_UPSTREAM_UNAVAILABLE,
  handleLiveProxyRequest,
  isLiveProxyPath,
  proxyLiveUpstream,
  resolveLiveProxyRequest,
} from './liveProxy';
import pagesRoutes from '../../public/_routes.json';
import { onRequest as pagesOnRequest } from '../../functions/_lib/handleLiveProxy';

describe('resolveLiveProxyRequest', () => {
  it('rewrites each allowlisted prefix to its fixed upstream host', () => {
    expect(resolveLiveProxyRequest('/ftc-proxy/2025/region/USNV')?.upstreamUrl.toString()).toBe(
      'https://ftc-events.firstinspires.org/2025/region/USNV',
    );
    expect(resolveLiveProxyRequest('/ftcscout-proxy/api/team/21535')?.upstreamUrl.toString()).toBe(
      'https://api.ftcscout.org/api/team/21535',
    );
    expect(resolveLiveProxyRequest('/portfolio-lab-proxy/portfolio')?.upstreamUrl.toString()).toBe(
      'https://www.ftcportfoliolab.org/portfolio',
    );
    expect(resolveLiveProxyRequest('/ftc-scoring-proxy/avatars/composed/2025.css')?.upstreamUrl.toString()).toBe(
      'https://ftc-scoring.firstinspires.org/avatars/composed/2025.css',
    );
  });

  it('preserves query strings and allows the bare prefix', () => {
    expect(resolveLiveProxyRequest('/ftc-proxy', '?x=1')?.upstreamUrl.toString()).toBe(
      'https://ftc-events.firstinspires.org/?x=1',
    );
  });

  it('rejects non-proxy paths and scheme-smuggling path segments', () => {
    expect(resolveLiveProxyRequest('/api/teams')).toBeNull();
    expect(resolveLiveProxyRequest('/ftc-proxy//evil.example')).toBeNull();
    expect(resolveLiveProxyRequest('/ftc-proxy/https://evil.example')).toBeNull();
  });

  it('does not treat similar prefixes as live proxy paths', () => {
    expect(isLiveProxyPath('/ftc-proxy-extra')).toBe(false);
    expect(isLiveProxyPath('/ftc-proxy/2025/team/1')).toBe(true);
  });
});

describe('proxyLiveUpstream', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('forwards GET requests and strips hop-by-hop / client IP headers', async () => {
    const resolved = resolveLiveProxyRequest('/ftc-proxy/2025/team/1');
    expect(resolved).not.toBeNull();

    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.has('host')).toBe(false);
      expect(headers.has('cf-connecting-ip')).toBe(false);
      expect(headers.get('accept')).toBe('text/html');
      return new Response('ok', { status: 200, headers: { 'content-type': 'text/html' } });
    });

    const request = new Request('https://app.example/ftc-proxy/2025/team/1', {
      headers: {
        accept: 'text/html',
        host: 'app.example',
        'cf-connecting-ip': '1.2.3.4',
      },
    });

    const response = await proxyLiveUpstream(request, resolved!, fetchImpl as typeof fetch);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://ftc-events.firstinspires.org/2025/team/1',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('sets short Cache-Control for current-season FTC Events and no-store on upstream errors', async () => {
    const resolved = resolveLiveProxyRequest('/ftc-proxy/2026/region/USNV');
    expect(resolved).not.toBeNull();

    const ok = await proxyLiveUpstream(
      new Request('https://app.example/ftc-proxy/2026/region/USNV'),
      resolved!,
      vi.fn(async () => new Response('ok', { status: 200 })) as unknown as typeof fetch,
    );
    expect(ok.headers.get('Cache-Control')).toBe('public, max-age=60');

    const failed = await proxyLiveUpstream(
      new Request('https://app.example/ftc-proxy/2026/region/USNV'),
      resolved!,
      vi.fn(async () => {
        throw new Error('boom');
      }) as unknown as typeof fetch,
    );
    expect(failed.status).toBe(502);
    expect(failed.headers.get('Cache-Control')).toBe('no-store');
  });

  it('rejects non-GET/HEAD methods', async () => {
    const resolved = resolveLiveProxyRequest('/ftcscout-proxy/api/team/1');
    const request = new Request('https://app.example/ftcscout-proxy/api/team/1', { method: 'POST' });
    const response = await proxyLiveUpstream(request, resolved!, vi.fn() as unknown as typeof fetch);
    expect(response.status).toBe(405);
    expect(await response.text()).toBe(LIVE_PROXY_BAD_REQUEST);
  });

  it('maps abort to 504 and other failures to 502', async () => {
    const resolved = resolveLiveProxyRequest('/ftc-proxy/2025/region/USNV');

    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    let response = await proxyLiveUpstream(
      new Request('https://app.example/ftc-proxy/2025/region/USNV'),
      resolved!,
      vi.fn(async () => {
        throw abortError;
      }) as unknown as typeof fetch,
    );
    expect(response.status).toBe(504);
    expect(await response.text()).toBe(LIVE_PROXY_UPSTREAM_TIMEOUT);

    response = await proxyLiveUpstream(
      new Request('https://app.example/ftc-proxy/2025/region/USNV'),
      resolved!,
      vi.fn(async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch,
    );
    expect(response.status).toBe(502);
    expect(await response.text()).toBe(LIVE_PROXY_UPSTREAM_UNAVAILABLE);
  });

  it('aborts after the configured timeout', async () => {
    vi.useFakeTimers();
    const resolved = resolveLiveProxyRequest('/ftc-proxy/2025/region/USNV');

    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    });

    const pending = proxyLiveUpstream(
      new Request('https://app.example/ftc-proxy/2025/region/USNV'),
      resolved!,
      fetchImpl as unknown as typeof fetch,
      LIVE_PROXY_TIMEOUT_MS,
    );

    await vi.advanceTimersByTimeAsync(LIVE_PROXY_TIMEOUT_MS);
    const response = await pending;
    expect(response.status).toBe(504);
  });
});

describe('handleLiveProxyRequest', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 for non-allowlisted paths and forwards allowlisted ones', async () => {
    const bad = await handleLiveProxyRequest(new Request('https://app.example/not-a-proxy'));
    expect(bad.status).toBe(400);
    expect(await bad.text()).toBe(LIVE_PROXY_BAD_REQUEST);

    const fetchImpl = vi.fn(async () => new Response('ok', { status: 200 }));
    const ok = await handleLiveProxyRequest(
      new Request('https://app.example/ftc-proxy/2025/team/1'),
      fetchImpl as unknown as typeof fetch,
    );
    expect(ok.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://ftc-events.firstinspires.org/2025/team/1',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

describe('Pages Functions live proxy parity', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('onRequest uses the same allowlisted forwarding as the Worker', async () => {
    const fetchImpl = vi.fn(async () => new Response('scout', { status: 200 }));
    vi.stubGlobal('fetch', fetchImpl);

    const response = await pagesOnRequest({
      request: new Request('https://pages.example/ftcscout-proxy/api/team/1'),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('scout');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.ftcscout.org/api/team/1',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('rejects POST through the Pages Function entry', async () => {
    const response = await pagesOnRequest({
      request: new Request('https://pages.example/portfolio-lab-proxy/portfolio', { method: 'POST' }),
    });
    expect(response.status).toBe(405);
  });
});

describe('Pages _routes.json', () => {
  it('includes public live-data prefixes plus the FIRST API proxy; never catch-all', () => {
    const expected = [
      ...LIVE_PROXY_ROUTES.flatMap((route) => [route.prefix, `${route.prefix}/*`]),
      '/ftc-api-proxy',
      '/ftc-api-proxy/*',
    ];
    expect(pagesRoutes.version).toBe(1);
    expect(pagesRoutes.include).toEqual(expected);
    expect(pagesRoutes.exclude).toEqual([]);
    expect(pagesRoutes.include).not.toContain('/*');
  });
});
