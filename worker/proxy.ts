import {
  isLiveProxyPath,
  proxyLiveUpstream,
  resolveLiveProxyRequest,
  LIVE_PROXY_BAD_REQUEST,
} from '../src/lib/liveProxy';

export interface Env {
  ASSETS: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  };
}

/**
 * Cloudflare Worker entry: serve Vite `dist/` assets, and proxy only the four
 * allowlisted live-data prefixes used by the browser (same as Vite dev proxies).
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (!isLiveProxyPath(url.pathname)) {
      return env.ASSETS.fetch(request);
    }

    const resolved = resolveLiveProxyRequest(url.pathname, url.search);
    if (!resolved) {
      return new Response(LIVE_PROXY_BAD_REQUEST, { status: 400 });
    }

    return proxyLiveUpstream(request, resolved);
  },
};
