/**
 * Secret-injected FIRST FTC Events API proxy.
 *
 * Browser prefix `/ftc-api-proxy` maps to `https://ftc-api.firstinspires.org/v2.0/...`.
 * Basic auth is added from Worker/Pages env (`FIRST_API_USERNAME` / `FIRST_API_TOKEN`).
 * The SPA must never send credentials. Public HTML proxies stay on `/ftc-proxy`.
 */

import { PROXY_ERROR_CACHE_CONTROL } from './edgeCachePolicy';
import {
  FIRST_API_BASE_URL,
  FIRST_API_TOKEN_ENV,
  FIRST_API_USERNAME_ENV,
  FIRST_API_USER_AGENT,
  FIRST_API_VERSION_PREFIX,
  isAllowedFirstApiPath,
  type FirstApiCredentials,
} from './firstEventsApi';
import { LIVE_PROXY_ALLOWED_METHODS, LIVE_PROXY_TIMEOUT_MS } from './liveProxy';

export const FIRST_API_PROXY_PREFIX = '/ftc-api-proxy';

export const FIRST_API_PROXY_BAD_REQUEST = 'FIRST API proxy request is not allowed.';
export const FIRST_API_PROXY_METHOD_NOT_ALLOWED = 'FIRST API proxy allows GET and HEAD only.';
export const FIRST_API_PROXY_CREDENTIALS_ABSENT =
  'FIRST API credentials are not configured on the server.';
export const FIRST_API_PROXY_UPSTREAM_TIMEOUT = 'FIRST API upstream request timed out.';
export const FIRST_API_PROXY_UPSTREAM_UNAVAILABLE = 'FIRST API upstream request failed.';

export type FirstApiProxyEnv = {
  FIRST_API_USERNAME?: string;
  FIRST_API_TOKEN?: string;
};

export type ResolvedFirstApiProxy = {
  upstreamUrl: URL;
  relativePath: string;
};

export function isFirstApiProxyPath(pathname: string): boolean {
  return pathname === FIRST_API_PROXY_PREFIX || pathname.startsWith(`${FIRST_API_PROXY_PREFIX}/`);
}

export function credentialsFromProxyEnv(env: FirstApiProxyEnv | undefined | null): FirstApiCredentials | null {
  const username = env?.FIRST_API_USERNAME?.trim() ?? '';
  const token = env?.FIRST_API_TOKEN?.trim() ?? '';
  if (!username || !token) {
    return null;
  }
  return { username, token };
}

export function resolveFirstApiProxyRequest(pathname: string, search = ''): ResolvedFirstApiProxy | null {
  if (!isFirstApiProxyPath(pathname)) {
    return null;
  }

  const rest = pathname.slice(FIRST_API_PROXY_PREFIX.length);
  if (rest.includes('://') || rest.startsWith('//') || rest.includes('..')) {
    return null;
  }

  const relative = rest.length === 0 || rest === '/' ? '/' : rest;
  if (!isAllowedFirstApiPath(relative)) {
    return null;
  }

  const upstreamUrl = new URL(`${FIRST_API_VERSION_PREFIX}${relative}${search}`, `${FIRST_API_BASE_URL}/`);
  if (upstreamUrl.protocol !== 'https:' || upstreamUrl.hostname !== 'ftc-api.firstinspires.org') {
    return null;
  }

  return { upstreamUrl, relativePath: relative };
}

function filterRequestHeaders(headers: Headers): Headers {
  const filtered = new Headers();
  for (const [key, value] of headers.entries()) {
    const lower = key.toLowerCase();
    if (
      lower === 'host' ||
      lower === 'connection' ||
      lower === 'content-length' ||
      lower === 'authorization' ||
      lower === 'cookie' ||
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
  filtered.delete('www-authenticate');
  filtered.delete('set-cookie');
  return filtered;
}

export async function handleFirstApiProxyRequest(
  request: Request,
  env: FirstApiProxyEnv | undefined | null,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = LIVE_PROXY_TIMEOUT_MS,
): Promise<Response> {
  const url = new URL(request.url);
  const resolved = resolveFirstApiProxyRequest(url.pathname, url.search);
  if (!resolved) {
    return new Response(FIRST_API_PROXY_BAD_REQUEST, {
      status: 400,
      headers: { 'Cache-Control': PROXY_ERROR_CACHE_CONTROL },
    });
  }

  if (!LIVE_PROXY_ALLOWED_METHODS.has(request.method.toUpperCase())) {
    return new Response(FIRST_API_PROXY_METHOD_NOT_ALLOWED, {
      status: 405,
      headers: { 'Cache-Control': PROXY_ERROR_CACHE_CONTROL },
    });
  }

  const credentials = credentialsFromProxyEnv(env);
  if (!credentials) {
    return new Response(FIRST_API_PROXY_CREDENTIALS_ABSENT, {
      status: 503,
      headers: { 'Cache-Control': PROXY_ERROR_CACHE_CONTROL },
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = filterRequestHeaders(request.headers);
    headers.set('Authorization', `Basic ${btoa(`${credentials.username}:${credentials.token}`)}`);
    headers.set('User-Agent', FIRST_API_USER_AGENT);
    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json');
    }

    const upstreamResponse = await fetchImpl(resolved.upstreamUrl.toString(), {
      method: request.method,
      headers,
      redirect: 'follow',
      signal: controller.signal,
    });

    const responseHeaders = filterResponseHeaders(upstreamResponse.headers);
    responseHeaders.set('Cache-Control', PROXY_ERROR_CACHE_CONTROL);

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return new Response(FIRST_API_PROXY_UPSTREAM_TIMEOUT, {
        status: 504,
        headers: { 'Cache-Control': PROXY_ERROR_CACHE_CONTROL },
      });
    }
    return new Response(FIRST_API_PROXY_UPSTREAM_UNAVAILABLE, {
      status: 502,
      headers: { 'Cache-Control': PROXY_ERROR_CACHE_CONTROL },
    });
  } finally {
    clearTimeout(timer);
  }
}

export const FIRST_API_PROXY_ENV_NAMES = [FIRST_API_USERNAME_ENV, FIRST_API_TOKEN_ENV] as const;
