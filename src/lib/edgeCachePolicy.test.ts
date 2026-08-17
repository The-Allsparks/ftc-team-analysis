import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CURRENT_SEASON } from '../data/seasons';
import { SNAPSHOT_CACHE_TTL } from '../data/snapshotTreeSchema';
import { LIVE_PROXY_ROUTES } from './liveProxy';
import {
  STATIC_CURRENT_CACHE_CONTROL,
  STATIC_HISTORICAL_CACHE_CONTROL,
  classifyProxyUpstream,
  classifyStaticDataPath,
  historicalSeasonsForHeaders,
  parseSeasonFromProxyPath,
  proxyResponseCacheControl,
  staticDataCacheControl,
} from './edgeCachePolicy';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('edgeCachePolicy', () => {
  it('classifies static snapshot paths into current / historical / mega-seed', () => {
    expect(classifyStaticDataPath('/data/manifest.json')).toBe('current');
    expect(classifyStaticDataPath('/data/source-health.json')).toBe('current');
    expect(classifyStaticDataPath('/data/teams/12777/index.json')).toBe('current');
    expect(classifyStaticDataPath(`/data/regions/USNV/${CURRENT_SEASON}/summary.json`)).toBe('current');
    expect(classifyStaticDataPath(`/data/teams/12777/${CURRENT_SEASON}.json`)).toBe('current');
    expect(classifyStaticDataPath('/data/regions/USNV/2019/summary.json')).toBe('historical');
    expect(classifyStaticDataPath('/data/teams/12777/2019.json')).toBe('historical');
    expect(classifyStaticDataPath('/data/nv-ftc-teams.generated.json')).toBe('mega-seed');
  });

  it('emits Cache-Control strings aligned with SNAPSHOT_CACHE_TTL', () => {
    expect(staticDataCacheControl('/data/manifest.json')).toBe(STATIC_CURRENT_CACHE_CONTROL);
    expect(staticDataCacheControl('/data/teams/1/2019.json')).toBe(STATIC_HISTORICAL_CACHE_CONTROL);
    expect(STATIC_CURRENT_CACHE_CONTROL).toContain(String(SNAPSHOT_CACHE_TTL.currentMaxAgeSeconds));
    expect(STATIC_HISTORICAL_CACHE_CONTROL).toContain(String(SNAPSHOT_CACHE_TTL.historicalMaxAgeSeconds));
  });

  it('classifies proxy upstreams conservatively by prefix and season', () => {
    const ftc = LIVE_PROXY_ROUTES.find((route) => route.prefix === '/ftc-proxy')!;
    const scout = LIVE_PROXY_ROUTES.find((route) => route.prefix === '/ftcscout-proxy')!;

    expect(classifyProxyUpstream(ftc, `/${CURRENT_SEASON}/region/USNV`)).toBe('ftc-events-current');
    expect(classifyProxyUpstream(ftc, '/2019/region/USNV')).toBe('ftc-events-historical');
    expect(classifyProxyUpstream(scout, '/api/team/1')).toBe('ftcscout');
    expect(parseSeasonFromProxyPath('/2024/team/1')).toBe(2024);
  });

  it('sets short Cache-Control on successful proxy responses and no-store on errors', () => {
    const ftc = LIVE_PROXY_ROUTES.find((route) => route.prefix === '/ftc-proxy')!;
    expect(proxyResponseCacheControl(ftc, `/${CURRENT_SEASON}/region/USNV`, 200)).toBe(
      'public, max-age=60',
    );
    expect(proxyResponseCacheControl(ftc, '/2019/region/USNV', 200)).toBe('public, max-age=3600');
    expect(proxyResponseCacheControl(ftc, `/${CURRENT_SEASON}/region/USNV`, 502)).toBe('no-store');
  });

  it('keeps public/_headers in sync with historical seasons (excluding CURRENT_SEASON)', () => {
    const headers = readFileSync(join(repoRoot, 'public/_headers'), 'utf8');
    const historical = historicalSeasonsForHeaders();

    expect(historical).not.toContain(CURRENT_SEASON);
    expect(headers).toContain(`/data/regions/*/${CURRENT_SEASON}/summary.json`);
    expect(headers).toContain(`max-age=${SNAPSHOT_CACHE_TTL.currentMaxAgeSeconds}`);

    for (const season of historical) {
      expect(headers).toContain(`/data/regions/*/${season}/summary.json`);
      expect(headers).toContain(`/data/teams/*/${season}.json`);
    }

    const historicalBlock = headers.slice(headers.indexOf('# Historical season'));
    expect(historicalBlock).toContain(`max-age=${SNAPSHOT_CACHE_TTL.historicalMaxAgeSeconds}`);
    expect(historicalBlock).not.toContain(`/data/teams/*/${CURRENT_SEASON}.json`);
  });
});
