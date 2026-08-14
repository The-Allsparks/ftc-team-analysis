/**
 * Production live-data proxy routes (same prefixes as Vite `server.proxy`).
 * Only these fixed upstream hosts are allowed — never browser-supplied destinations.
 */

export const LIVE_PROXY_ROUTES = [
  { prefix: '/ftc-proxy', targetOrigin: 'https://ftc-events.firstinspires.org' },
  { prefix: '/ftcscout-proxy', targetOrigin: 'https://api.ftcscout.org' },
  { prefix: '/portfolio-lab-proxy', targetOrigin: 'https://www.ftcportfoliolab.org' },
  { prefix: '/ftc-scoring-proxy', targetOrigin: 'https://ftc-scoring.firstinspires.org' },
] as const;

export type LiveProxyRoute = (typeof LIVE_PROXY_ROUTES)[number];

export const LIVE_PROXY_ALLOWED_METHODS = new Set(['GET', 'HEAD']);

export const LIVE_PROXY_TIMEOUT_MS = 20_000;

export const LIVE_PROXY_BAD_REQUEST = 'Live proxy request is not allowed.';
export const LIVE_PROXY_UPSTREAM_TIMEOUT = 'Upstream request timed out.';
export const LIVE_PROXY_UPSTREAM_UNAVAILABLE = 'Upstream request failed.';

export type ResolvedLiveProxy = {
  upstreamUrl: URL;
  route: LiveProxyRoute;
};

export function resolveLiveProxyRequest(pathname: string, search = ''): ResolvedLiveProxy | null {
  for (const route of LIVE_PROXY_ROUTES) {
    if (pathname !== route.prefix && !pathname.startsWith(`${route.prefix}/`)) {
      continue;
    }

    const rest = pathname.slice(route.prefix.length);
    if (rest.includes('://') || rest.startsWith('//')) {
      return null;
    }

    const path = rest.length === 0 ? '/' : rest;
    const upstreamUrl = new URL(`${path}${search}`, route.targetOrigin);
    const expectedHost = new URL(route.targetOrigin).hostname;

    if (upstreamUrl.protocol !== 'https:' || upstreamUrl.hostname !== expectedHost) {
      return null;
    }

    return { upstreamUrl, route };
  }

  return null;
}

export function isLiveProxyPath(pathname: string): boolean {
  return resolveLiveProxyRequest(pathname) !== null;
}

function filterRequestHeaders(headers: Headers): Headers {
  const filtered = new Headers();
  for (const [key, value] of headers.entries()) {
    const lower = key.toLowerCase();
    if (
      lower === 'host' ||
      lower === 'connection' ||
      lower === 'content-length' ||
      lower === 'cf-connecting-ip' ||
      lower === 'cf-ipcountry' ||
      lower === 'x-forwarded-for' ||
      lower === 'x-real-ip' ||
      lower.startsWith('cf-')
    ) {
      continue;
    }
    filtered.set(key, value);
  }
  return filtered;
}

function filterResponseHeaders(headers: Headers): Headers {
  const filtered = new Headers(headers);
  filtered.delete('content-encoding');
  filtered.delete('transfer-encoding');
  filtered.delete('content-length');
  return filtered;
}

export async function proxyLiveUpstream(
  request: Request,
  resolved: ResolvedLiveProxy,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = LIVE_PROXY_TIMEOUT_MS,
): Promise<Response> {
  if (!LIVE_PROXY_ALLOWED_METHODS.has(request.method.toUpperCase())) {
    return new Response(LIVE_PROXY_BAD_REQUEST, { status: 405 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const upstreamResponse = await fetchImpl(resolved.upstreamUrl.toString(), {
      method: request.method,
      headers: filterRequestHeaders(request.headers),
      redirect: 'follow',
      signal: controller.signal,
    });

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: filterResponseHeaders(upstreamResponse.headers),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return new Response(LIVE_PROXY_UPSTREAM_TIMEOUT, { status: 504 });
    }
    return new Response(LIVE_PROXY_UPSTREAM_UNAVAILABLE, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
