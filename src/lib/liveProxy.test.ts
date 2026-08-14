import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LIVE_PROXY_BAD_REQUEST,
  LIVE_PROXY_TIMEOUT_MS,
  LIVE_PROXY_UPSTREAM_TIMEOUT,
  LIVE_PROXY_UPSTREAM_UNAVAILABLE,
  isLiveProxyPath,
  proxyLiveUpstream,
  resolveLiveProxyRequest,
} from './liveProxy';

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
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://ftc-events.firstinspires.org/2025/team/1',
      expect.objectContaining({ method: 'GET' }),
    );
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
