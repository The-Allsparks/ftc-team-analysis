import { handleLiveProxyRequest } from '../../src/lib/liveProxy';

/**
 * Shared Pages Function entry for all allowlisted live-data prefixes.
 * Keep this thin — allowlist + GET/HEAD forward only (parity with Worker).
 */
export async function onRequest(context: { request: Request }): Promise<Response> {
  return handleLiveProxyRequest(context.request);
}
