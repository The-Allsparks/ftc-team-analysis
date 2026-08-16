import { parse, type HTMLElement } from 'node-html-parser';
import type {
  LinkConfirmation,
  LinkLiveness,
  LinkOwnershipConfidence,
  Team,
  TeamLink,
} from '../data/schema';
import {
  addTeamLink,
  classifyTeamLink,
  isTeamRelatedWebsite,
  linkPriority,
  normalizeExternalUrl,
  shouldKeepDiscoveredLink,
  socialLinkLooksUseful,
} from './ftcParsers';

export const LINK_DISCOVERY_USER_AGENT = 'Nevada FTC Team Explorer public link discovery';
export const LINK_FETCH_TIMEOUT_MS = 8000;

/** Same-origin paths commonly used for contact / social / resource hubs. */
export const COMMON_TEAM_SITE_PATHS = [
  '/about',
  '/sponsors',
  '/robots',
  '/robot',
  '/resources',
  '/contact',
  '/links',
  '/linktree',
  '/team',
  '/social',
  '/connect',
] as const;

const MAX_SITEMAP_URLS = 12;
const MAX_EXTRA_PAGES = 8;
const TRACKING_PARAM_EXACT = new Set([
  'ref',
  'refid',
  'mibextid',
  'refer',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'si',
  'feature',
]);

export type LinkDiscoveryOptions = {
  fetchImpl?: typeof fetch;
  checkLiveness?: boolean;
  now?: () => string;
};

export type AddDiscoveredLinkOptions = {
  source: string;
  ownershipConfidence: LinkOwnershipConfidence;
  confirmationState?: LinkConfirmation;
  evidence?: string | null;
  notes?: string | null;
  retrievedAt?: string | null;
  lastCheckedAt?: string | null;
  httpStatus?: number | null;
  liveness?: LinkLiveness;
};

function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function hostKey(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return hostKey(a) === hostKey(b);
  } catch {
    return false;
  }
}

function finalizeNormalizedUrl(url: URL): string {
  let pathname = url.pathname.replace(/\/{2,}/g, '/') || '/';
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }
  url.pathname = pathname;
  const pathAndQuery = `${pathname === '/' ? '' : pathname}${url.search}`;
  return `${url.protocol}//${url.host}${pathAndQuery}`;
}

/**
 * Stronger URL normalization for link discovery:
 * strip tracking params, drop fragments/credentials, prefer https,
 * and normalize trailing slashes.
 */
export function normalizeLinkUrl(value: string | null | undefined, base?: string): string | null {
  const raw = cleanText(value);

  if (!raw || /^(mailto|tel|javascript):/i.test(raw)) {
    return null;
  }

  try {
    const url = new URL(raw, base);

    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }

    if (url.protocol === 'http:') {
      url.protocol = 'https:';
    }

    url.hash = '';
    url.username = '';
    url.password = '';

    for (const key of [...url.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (/^utm_/i.test(key) || TRACKING_PARAM_EXACT.has(lower) || lower.startsWith('pk_')) {
        url.searchParams.delete(key);
      }
    }

    const youtubeChannel = url.hostname.includes('youtube.com') && url.pathname.match(/^\/channel\/([^/]+)/);
    if (youtubeChannel) {
      url.pathname = `/channel/${youtubeChannel[1]}`;
    }

    const youtubeHandle = url.hostname.includes('youtube.com') && url.pathname.match(/^\/@([^/]+)/);
    if (youtubeHandle) {
      url.pathname = `/@${youtubeHandle[1]}`;
    }

    return finalizeNormalizedUrl(url);
  } catch {
    const fallback = normalizeExternalUrl(value, base);
    if (!fallback) {
      return null;
    }
    try {
      return finalizeNormalizedUrl(new URL(fallback));
    } catch {
      return fallback;
    }
  }
}

/**
 * Heuristic privacy filter: drop personal-looking student social handles and mailto.
 * Team-number / robotics / FTC signals keep an account.
 * See docs/privacy.md and docs/link-discovery.md.
 */
export function looksLikePersonalOrStudentAccount(url: string, team?: Team): boolean {
  const trimmed = cleanText(url);
  if (!trimmed) {
    return true;
  }

  if (/^mailto:/i.test(trimmed)) {
    return true;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return true;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return true;
  }

  const hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();
  const path = parsed.pathname.replace(/\/$/, '');
  const handle = path.replace(/^\/@?/, '').split('/')[0] ?? '';
  const compactHandle = handle.toLowerCase().replace(/[^a-z0-9]/g, '');
  const teamNumber = team ? String(team.number) : null;

  if (teamNumber && (path.includes(teamNumber) || compactHandle.includes(teamNumber))) {
    return false;
  }

  if (/\b(ftc|first|robotics?|robot|stem|frc|team)\b/i.test(handle) || /ftc|robotics|robot|stem/.test(compactHandle)) {
    return false;
  }

  const isSocialHost =
    hostname.includes('instagram.com') ||
    hostname.includes('tiktok.com') ||
    hostname === 'x.com' ||
    hostname.includes('twitter.com') ||
    hostname.includes('facebook.com') ||
    hostname.includes('linkedin.com');

  if (!isSocialHost) {
    return false;
  }

  // LinkedIn personal profiles vs company/school pages
  if (hostname.includes('linkedin.com') && /^\/in\//i.test(path)) {
    return true;
  }

  // Facebook personal profile id pattern
  if (hostname.includes('facebook.com') && /^\/profile\.php/i.test(path)) {
    return true;
  }

  if (!handle || handle.length < 3) {
    return false;
  }

  // first.last / first_last / FirstLast without robotics markers
  const dottedName = /^[a-z]{2,}\.[a-z]{2,}$/i.test(handle);
  const underscoredName = /^[a-z]{2,}_[a-z]{2,}$/i.test(handle);
  const camelName = /^[A-Z][a-z]{2,}[A-Z][a-z]{2,}$/.test(handle);
  const twoTokenCompact = /^[a-z]{3,}[a-z]{3,}$/i.test(compactHandle) && !/\d/.test(compactHandle);

  if (dottedName || underscoredName || camelName) {
    return true;
  }

  // Very short handles that look like given names only (e.g. /emma, /jake) without digits/team signals
  if (/^[a-z]{3,12}$/i.test(handle) && !/\d/.test(handle) && twoTokenCompact === false) {
    // Keep when socialLinkLooksUseful already rejected junk paths; still filter bare given-name handles
    const commonGivenNames = /^(emma|jake|sarah|john|mike|alex|anna|lisa|ryan|kate|noah|liam|olivia|ava|mia)$/i;
    if (commonGivenNames.test(handle)) {
      return true;
    }
  }

  return false;
}

export function isAllowedPublicTeamLink(url: string, team?: Team): boolean {
  if (looksLikePersonalOrStudentAccount(url, team)) {
    return false;
  }

  try {
    const classified = classifyTeamLink(url);
    if (classified.type === 'social') {
      return socialLinkLooksUseful(url);
    }
  } catch {
    return false;
  }

  return true;
}

export function inferOwnershipConfidence(args: {
  url: string;
  source: string;
  teamWebsite?: string | null;
  pageText?: string;
  team?: Team;
}): { ownershipConfidence: LinkOwnershipConfidence; evidence: string; confirmationState: LinkConfirmation } {
  const { url, source, teamWebsite, pageText = '', team } = args;
  const sourceLower = source.toLowerCase();

  if (sourceLower.includes('on the web')) {
    return {
      ownershipConfidence: 'high',
      evidence: 'Declared On The Web URL from FTC Events',
      confirmationState: 'unconfirmed',
    };
  }

  if (teamWebsite && sameOrigin(url, teamWebsite)) {
    return {
      ownershipConfidence: 'high',
      evidence: `Same host as declared team website (${hostKey(teamWebsite)})`,
      confirmationState: 'unconfirmed',
    };
  }

  const combined = `${url} ${pageText}`;
  const hasIdentity =
    Boolean(team) &&
    (new RegExp(`\\bteam\\s*${team!.number}\\b`, 'i').test(combined) ||
      combined.toLowerCase().includes(String(team!.number)) ||
      /\b(ftc|robotics?)\b/i.test(combined));

  if (sourceLower.includes('team website') || sourceLower.includes('sitemap') || sourceLower.includes('link hub')) {
    if (hasIdentity || (teamWebsite && team && isTeamRelatedWebsite(teamWebsite, pageText, team))) {
      return {
        ownershipConfidence: 'medium',
        evidence: 'Linked from team website with team/robotics corroboration',
        confirmationState: 'unconfirmed',
      };
    }

    return {
      ownershipConfidence: 'low',
      evidence: 'Linked from crawled public page without strong team corroboration',
      confirmationState: 'unconfirmed',
    };
  }

  return {
    ownershipConfidence: 'low',
    evidence: 'Weak public association',
    confirmationState: 'unconfirmed',
  };
}

export function upsertTeamLink(
  links: Map<string, TeamLink>,
  url: string | null,
  options: AddDiscoveredLinkOptions,
): void {
  if (!url || !isAllowedPublicTeamLink(url)) {
    return;
  }

  const classified = classifyTeamLink(url);
  const existing = links.get(url);
  const next: TeamLink = {
    ...(existing ?? classified),
    type: existing?.type ?? classified.type,
    label: existing?.label ?? classified.label,
    url,
    source: existing?.source ?? options.source,
    ownershipConfidence: pickHigherConfidence(existing?.ownershipConfidence, options.ownershipConfidence),
    confirmationState: existing?.confirmationState ?? options.confirmationState ?? 'unconfirmed',
    evidence: options.evidence ?? existing?.evidence ?? null,
    notes: options.notes ?? existing?.notes ?? null,
    retrievedAt: options.retrievedAt ?? existing?.retrievedAt ?? null,
    lastCheckedAt: options.lastCheckedAt ?? existing?.lastCheckedAt ?? null,
    httpStatus: options.httpStatus ?? existing?.httpStatus ?? null,
    liveness: options.liveness ?? existing?.liveness ?? 'unknown',
  };

  // Prefer the higher-confidence source label when upgrading
  if (
    !existing ||
    confidenceRank(options.ownershipConfidence) > confidenceRank(existing.ownershipConfidence ?? 'low')
  ) {
    next.source = options.source;
    if (options.evidence) {
      next.evidence = options.evidence;
    }
  }

  links.set(url, next);
}

function confidenceRank(value: LinkOwnershipConfidence | undefined): number {
  return { high: 3, medium: 2, low: 1 }[value ?? 'low'];
}

function pickHigherConfidence(
  a: LinkOwnershipConfidence | undefined,
  b: LinkOwnershipConfidence,
): LinkOwnershipConfidence {
  return confidenceRank(a) >= confidenceRank(b) ? (a ?? b) : b;
}

export type LinkCheckResult = {
  liveness: LinkLiveness;
  httpStatus: number | null;
  lastCheckedAt: string;
};

/**
 * Dead-link probe: HEAD then GET fallback. Does not drop URLs — callers attach status.
 */
export async function checkLinkLiveness(
  url: string,
  options: { fetchImpl?: typeof fetch; now?: () => string; timeoutMs?: number } = {},
): Promise<LinkCheckResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date().toISOString());
  const timeoutMs = options.timeoutMs ?? LINK_FETCH_TIMEOUT_MS;
  const checkedAt = now();

  const probe = async (method: 'HEAD' | 'GET'): Promise<LinkCheckResult> => {
    try {
      const response = await fetchImpl(url, {
        method,
        headers: { 'user-agent': LINK_DISCOVERY_USER_AGENT, accept: '*/*' },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.status === 404 || response.status === 410) {
        return { liveness: 'dead', httpStatus: response.status, lastCheckedAt: checkedAt };
      }

      if (response.status === 405 && method === 'HEAD') {
        return probe('GET');
      }

      if (response.ok || (response.status >= 300 && response.status < 400)) {
        return { liveness: 'alive', httpStatus: response.status, lastCheckedAt: checkedAt };
      }

      // Some hosts reject HEAD with 403/401 but serve GET; try once.
      if (method === 'HEAD' && (response.status === 403 || response.status === 401)) {
        return probe('GET');
      }

      if (response.status >= 500) {
        return { liveness: 'unknown', httpStatus: response.status, lastCheckedAt: checkedAt };
      }

      return { liveness: 'dead', httpStatus: response.status, lastCheckedAt: checkedAt };
    } catch {
      return { liveness: 'unknown', httpStatus: null, lastCheckedAt: checkedAt };
    }
  };

  return probe('HEAD');
}

export async function attachLiveness(
  links: TeamLink[],
  options: LinkDiscoveryOptions = {},
): Promise<TeamLink[]> {
  if (options.checkLiveness !== true) {
    return links;
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date().toISOString());

  return Promise.all(
    links.map(async (link) => {
      const result = await checkLinkLiveness(link.url, { fetchImpl, now });
      return {
        ...link,
        liveness: result.liveness,
        httpStatus: result.httpStatus,
        lastCheckedAt: result.lastCheckedAt,
      };
    }),
  );
}

export function extractSitemapLocs(xml: string, originUrl: string): string[] {
  const locs: string[] = [];
  const matches = xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi);

  for (const match of matches) {
    const url = normalizeLinkUrl(cleanText(match[1]), originUrl);
    if (!url || !sameOrigin(url, originUrl)) {
      continue;
    }
    locs.push(url);
    if (locs.length >= MAX_SITEMAP_URLS) {
      break;
    }
  }

  return [...new Set(locs)];
}

export function extractSitemapUrlsFromRobots(robotsText: string, originUrl: string): string[] {
  const urls: string[] = [];

  for (const line of robotsText.split(/\r?\n/)) {
    const match = line.match(/^\s*sitemap:\s*(\S+)/i);
    if (!match) {
      continue;
    }
    const url = normalizeLinkUrl(match[1], originUrl);
    if (url) {
      urls.push(url);
    }
  }

  return [...new Set(urls)];
}

export function preferDiscoveryPaths(urls: string[], teamWebsite: string): string[] {
  const scored = urls.map((url) => {
    let score = 0;
    try {
      const path = new URL(url).pathname.toLowerCase();
      if (COMMON_TEAM_SITE_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) {
        score += 5;
      }
      if (/(about|sponsor|robot|resource|contact|link|social|team)/i.test(path)) {
        score += 2;
      }
      if (path === '/' || path === '') {
        score -= 3;
      }
    } catch {
      score -= 10;
    }
    return { url, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url))
    .map((item) => item.url)
    .filter((url) => url !== normalizeLinkUrl(teamWebsite))
    .slice(0, MAX_EXTRA_PAGES);
}

export function extractAnchorsFromHtml(
  html: string,
  pageUrl: string,
): Array<{ url: string; label: string }> {
  const root = parse(html);
  const results: Array<{ url: string; label: string }> = [];

  for (const anchor of root.querySelectorAll('a') as HTMLElement[]) {
    const href = anchor.getAttribute('href') ?? '';
    if (/refer=embed/i.test(href) || /^(mailto|tel|javascript):/i.test(href)) {
      continue;
    }

    const url = normalizeLinkUrl(href, pageUrl);
    if (!url) {
      continue;
    }

    results.push({ url, label: cleanText(anchor.textContent) });
  }

  return results;
}

export function pageHeadingText(html: string): string {
  const root = parse(html);
  return cleanText(
    [root.querySelector('title')?.textContent, root.querySelector('h1')?.textContent].join(' '),
  );
}

export function isLinkHubUrl(url: string): boolean {
  try {
    return classifyTeamLink(url).type === 'link-hub';
  } catch {
    return false;
  }
}

async function fetchText(
  url: string,
  fetchImpl: typeof fetch,
): Promise<{ ok: boolean; status: number; contentType: string; text: string } | null> {
  try {
    const response = await fetchImpl(url, {
      headers: { 'user-agent': LINK_DISCOVERY_USER_AGENT, accept: 'text/html,application/xml,text/xml,text/plain,*/*' },
      signal: AbortSignal.timeout(LINK_FETCH_TIMEOUT_MS),
    });
    const contentType = response.headers.get('content-type') ?? '';
    const text = await response.text();
    return { ok: response.ok, status: response.status, contentType, text };
  } catch {
    return null;
  }
}

function collectFromPage(args: {
  links: Map<string, TeamLink>;
  pageUrl: string;
  html: string;
  teamWebsite: string;
  team: Team;
  siteIsTeamRelated: boolean;
  source: string;
  retrievedAt: string;
}): void {
  const heading = pageHeadingText(args.html);
  const anchors = extractAnchorsFromHtml(args.html, args.pageUrl);

  for (const anchor of anchors) {
    if (!shouldKeepDiscoveredLink(anchor.url, args.teamWebsite, anchor.label, args.team, args.siteIsTeamRelated)) {
      continue;
    }
    if (!isAllowedPublicTeamLink(anchor.url, args.team)) {
      continue;
    }

    const ownership = inferOwnershipConfidence({
      url: anchor.url,
      source: args.source,
      teamWebsite: args.teamWebsite,
      pageText: `${heading} ${anchor.label}`,
      team: args.team,
    });

    upsertTeamLink(args.links, anchor.url, {
      source: args.source,
      ownershipConfidence: ownership.ownershipConfidence,
      confirmationState: ownership.confirmationState,
      evidence: ownership.evidence,
      retrievedAt: args.retrievedAt,
      liveness: 'unknown',
    });
  }
}

/**
 * Bounded discovery: On The Web URL + homepage + sitemap/common paths + link-hub outs.
 * Privacy filters and ownership confidence are applied; optional liveness checks attach status.
 */
export async function discoverLinksForWebsite(
  teamWebsite: string,
  team: Team,
  options: LinkDiscoveryOptions = {},
): Promise<TeamLink[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date().toISOString());
  const retrievedAt = now();
  const links = new Map<string, TeamLink>();
  const normalizedWebsite = normalizeLinkUrl(teamWebsite);

  if (!normalizedWebsite) {
    return [];
  }

  const websiteType = classifyTeamLink(normalizedWebsite).type;

  const addRoot = (source: string, confidence: LinkOwnershipConfidence, evidence: string) => {
    if (websiteType === 'social' && !socialLinkLooksUseful(normalizedWebsite)) {
      return;
    }
    if (!isAllowedPublicTeamLink(normalizedWebsite, team)) {
      return;
    }

    upsertTeamLink(links, normalizedWebsite, {
      source,
      ownershipConfidence: confidence,
      confirmationState: 'unconfirmed',
      evidence,
      retrievedAt,
      liveness: 'unknown',
    });
  };

  if (websiteType !== 'website' && websiteType !== 'link-hub') {
    addRoot('FTC Events On The Web', 'high', 'Declared On The Web URL from FTC Events');
    const withStatus = await attachLiveness([...links.values()], options);
    return withStatus.sort((a, b) => linkPriority(a) - linkPriority(b) || a.label.localeCompare(b.label));
  }

  let siteIsTeamRelated = isTeamRelatedWebsite(normalizedWebsite, '', team);
  const homepage = await fetchText(normalizedWebsite, fetchImpl);

  if (!homepage || !homepage.ok || !homepage.contentType.includes('text/html')) {
    if (siteIsTeamRelated) {
      addRoot('FTC Events On The Web', 'high', 'Declared On The Web URL from FTC Events');
    }
    const withStatus = await attachLiveness([...links.values()], options);
    return withStatus.sort((a, b) => linkPriority(a) - linkPriority(b) || a.label.localeCompare(b.label));
  }

  const heading = pageHeadingText(homepage.text);
  siteIsTeamRelated = isTeamRelatedWebsite(normalizedWebsite, heading, team);

  if (siteIsTeamRelated) {
    addRoot('FTC Events On The Web', 'high', 'Declared On The Web URL from FTC Events');
  }

  collectFromPage({
    links,
    pageUrl: normalizedWebsite,
    html: homepage.text,
    teamWebsite: normalizedWebsite,
    team,
    siteIsTeamRelated,
    source: 'Team website',
    retrievedAt,
  });

  // Link-hub homepage: treat outbound extracts as hub-sourced
  if (isLinkHubUrl(normalizedWebsite)) {
    collectFromPage({
      links,
      pageUrl: normalizedWebsite,
      html: homepage.text,
      teamWebsite: normalizedWebsite,
      team,
      siteIsTeamRelated: true,
      source: 'Link hub',
      retrievedAt,
    });
  }

  const origin = new URL(normalizedWebsite).origin;
  const extraPages = new Set<string>();

  for (const path of COMMON_TEAM_SITE_PATHS) {
    const candidate = normalizeLinkUrl(`${origin}${path}`);
    if (candidate && candidate !== normalizedWebsite) {
      extraPages.add(candidate);
    }
  }

  const robots = await fetchText(`${origin}/robots.txt`, fetchImpl);
  if (robots?.ok) {
    for (const sitemapUrl of extractSitemapUrlsFromRobots(robots.text, normalizedWebsite)) {
      const sitemap = await fetchText(sitemapUrl, fetchImpl);
      if (!sitemap?.ok) {
        continue;
      }
      for (const loc of preferDiscoveryPaths(extractSitemapLocs(sitemap.text, normalizedWebsite), normalizedWebsite)) {
        extraPages.add(loc);
      }
    }
  } else {
    const defaultSitemap = await fetchText(`${origin}/sitemap.xml`, fetchImpl);
    if (defaultSitemap?.ok) {
      for (const loc of preferDiscoveryPaths(
        extractSitemapLocs(defaultSitemap.text, normalizedWebsite),
        normalizedWebsite,
      )) {
        extraPages.add(loc);
      }
    }
  }

  let crawled = 0;
  for (const pageUrl of [...extraPages].slice(0, MAX_EXTRA_PAGES)) {
    if (crawled >= MAX_EXTRA_PAGES) {
      break;
    }

    const page = await fetchText(pageUrl, fetchImpl);

    if (!page?.ok) {
      continue;
    }

    const isXml = page.contentType.includes('xml') || pageUrl.endsWith('.xml');
    if (isXml) {
      continue;
    }

    if (!page.contentType.includes('text/html') && !page.text.includes('<a ')) {
      continue;
    }

    crawled += 1;

    const source = isLinkHubUrl(pageUrl) || /linktree|links|link-hub/i.test(pageUrl) ? 'Link hub' : 'Team website path';
    collectFromPage({
      links,
      pageUrl,
      html: page.text,
      teamWebsite: normalizedWebsite,
      team,
      siteIsTeamRelated,
      source,
      retrievedAt,
    });

    // Nested link-hub pages discovered from path pages
    for (const anchor of extractAnchorsFromHtml(page.text, pageUrl)) {
      if (!isLinkHubUrl(anchor.url) || !isAllowedPublicTeamLink(anchor.url, team)) {
        continue;
      }
      if (!shouldKeepDiscoveredLink(anchor.url, normalizedWebsite, anchor.label, team, siteIsTeamRelated)) {
        if (!(siteIsTeamRelated && classifyTeamLink(anchor.url).type === 'link-hub')) {
          continue;
        }
      }

      const ownership = inferOwnershipConfidence({
        url: anchor.url,
        source: 'Team website',
        teamWebsite: normalizedWebsite,
        pageText: anchor.label,
        team,
      });
      upsertTeamLink(links, anchor.url, {
        source: 'Team website',
        ownershipConfidence: ownership.ownershipConfidence,
        confirmationState: ownership.confirmationState,
        evidence: ownership.evidence,
        retrievedAt,
        liveness: 'unknown',
      });
    }
  }

  // Crawl Linktree-style hubs discovered from the homepage or path pages (separate small budget)
  const hubUrls = [...links.values()]
    .filter((link) => link.type === 'link-hub')
    .map((link) => link.url);
  let hubsCrawled = 0;

  for (const hubUrl of hubUrls) {
    if (hubsCrawled >= 3) {
      break;
    }

    const hub = await fetchText(hubUrl, fetchImpl);
    hubsCrawled += 1;

    if (!hub?.ok || !hub.contentType.includes('text/html')) {
      continue;
    }

    collectFromPage({
      links,
      pageUrl: hubUrl,
      html: hub.text,
      teamWebsite: normalizedWebsite,
      team,
      siteIsTeamRelated: true,
      source: 'Link hub',
      retrievedAt,
    });
  }

  // Compatibility: ensure addTeamLink-style entries still flow through privacy gate
  for (const [url] of [...links.entries()]) {
    if (!isAllowedPublicTeamLink(url, team)) {
      links.delete(url);
    }
  }

  const withStatus = await attachLiveness([...links.values()], options);

  return withStatus.sort((a, b) => linkPriority(a) - linkPriority(b) || a.label.localeCompare(b.label));
}

/** Fixture/helper: count teams with ≥1 non-dead public link. */
export function countTeamsWithVerifiedLink(teams: Array<{ links: TeamLink[] }>): number {
  return teams.filter((team) =>
    team.links.some((link) => link.liveness !== 'dead' && Boolean(link.url)),
  ).length;
}

// Re-export addTeamLink for callers that still use the simple map helper during migration.
export { addTeamLink };
