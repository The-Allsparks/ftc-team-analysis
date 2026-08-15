import { HttpStatusError } from './sourceResult';

const FTC_PROXY_PREFIX = '/ftc-proxy';

export function toFtcProxyUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${FTC_PROXY_PREFIX}${normalized}`;
}

export async function fetchFtcHtml(path: string, attempt = 1): Promise<string> {
  let response: Response;

  try {
    response = await fetch(toFtcProxyUrl(path), {
      headers: {
        accept: 'text/html',
      },
    });
  } catch (error) {
    throw error instanceof TypeError ? error : new TypeError(String(error));
  }

  if (response.status === 429 && attempt < 4) {
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    return fetchFtcHtml(path, attempt + 1);
  }

  if (!response.ok) {
    throw new HttpStatusError(`GET ${path} failed with ${response.status}`, response.status);
  }

  return response.text();
}

export async function fetchFtcOk(path: string, attempt = 1): Promise<boolean> {
  try {
    const response = await fetch(toFtcProxyUrl(path), {
      method: 'HEAD',
      headers: {
        accept: 'text/html',
      },
    });

    if (response.status === 429 && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      return fetchFtcOk(path, attempt + 1);
    }

    return response.ok;
  } catch {
    return false;
  }
}

export function isLiveFetchAvailable(): boolean {
  return typeof window !== 'undefined';
}
