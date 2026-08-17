import { handleFirstApiProxyRequest, type FirstApiProxyEnv } from '../../src/lib/firstApiProxy';

export async function onRequest(context: {
  request: Request;
  env?: FirstApiProxyEnv;
}): Promise<Response> {
  return handleFirstApiProxyRequest(context.request, context.env);
}
