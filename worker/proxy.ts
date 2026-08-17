import { handleFirstApiProxyRequest, isFirstApiProxyPath } from '../src/lib/firstApiProxy';
import { handleLiveProxyRequest, isLiveProxyPath } from '../src/lib/liveProxy';

export interface Env {
  ASSETS: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  };
  FIRST_API_USERNAME?: string;
  FIRST_API_TOKEN?: string;
}

/**
 * Cloudflare Worker entry: serve Vite `dist/` assets, proxy public live-data
 * prefixes, and optionally inject FIRST API Basic auth for `/ftc-api-proxy`.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (isFirstApiProxyPath(url.pathname)) {
      return handleFirstApiProxyRequest(request, env);
    }

    if (!isLiveProxyPath(url.pathname)) {
      return env.ASSETS.fetch(request);
    }

    return handleLiveProxyRequest(request);
  },
};
