import { HTMLElement, parse } from 'node-html-parser';
import {
  RecordSummary,
  RegionEvent,
  SeasonId,
  TARGET_SEASONS,
  Team,
  TeamAward,
  TeamEvent,
  TeamLink,
  TeamSeason,
} from '../data/schema';
import { parseOrganizationAffiliations } from './organizationAffiliations';
import { buildSeasonEvidence, mergeSeasonEvidence } from './fieldEvidence';

export const BASE_URL = 'https://ftc-events.firstinspires.org';
export const FIRST_SEARCH_URL = 'https://3dl2fnsh51.execute-api.us-east-1.amazonaws.com/prod/first-search';
export const DEFAULT_REGION_CODE = 'USNV';
export const REGION_CODE = DEFAULT_REGION_CODE;

export type RegionTeamSeed = {
  season: SeasonId;
  number: number;
  name: string;
  location: string;
  city: string | null;
  state: string | null;
  country: string | null;
  rookieYear: number | null;
  organization: string | null;
  sourceUrl: string;
  seedSource: 'ftc-events' | 'first-search';
};

export type LeagueSeed = {
  season: SeasonId;
  name: string;
  sourceUrl: string;
};

export type LeagueRanking = {
  season: SeasonId;
  league: string;
  teamNumber: number;
  rank: number;
  rankingScore: number;
  matchPoints: number | null;
  plays: number | null;
};

export type ParsedRegion = {
  teams: RegionTeamSeed[];
  events: RegionEvent[];
  leagues: LeagueSeed[];
};

export const sleep = (ms: number) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

export function cleanText(value: string | null | undefined): string {
  return decodeHtml(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.:;])/g, '$1')
    .trim();
}

export function nullable(value: string | null | undefined): string | null {
  const cleaned = cleanText(value);
  return cleaned.length > 0 ? cleaned : null;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(html: string): string {
  return cleanText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  );
}

function absoluteUrl(href: string | null | undefined): string | null {
  if (!href) {
    return null;
  }

  if (href.startsWith('http')) {
    return href;
  }

  return `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
}

export function normalizeExternalUrl(value: string | null | undefined, base?: string): string | null {
  const raw = cleanText(value);

  if (!raw || /^(mailto|tel|javascript):/i.test(raw)) {
    return null;
  }

  try {
    const url = new URL(raw, base);

    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }

    url.hash = '';

    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || ['ref', 'refid', 'mibextid', 'refer'].includes(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }

    const youtubeChannel = url.hostname.includes('youtube.com') && url.pathname.match(/^\/channel\/([^/]+)/);

    if (youtubeChannel) {
      url.pathname = `/channel/${youtubeChannel[1]}`;
    }

    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function parseLocation(location: string): Pick<RegionTeamSeed, 'city' | 'state' | 'country'> {
  const parts = location.split(',').map((part) => cleanText(part));

  return {
    city: parts[0] || null,
    state: parts[1] || null,
    country: parts.slice(2).join(', ') || null,
  };
}

function eventDateSortValue(date: string | null | undefined): number {
  const firstDate = cleanText(date).split('-')[0]?.trim();
  const match = firstDate?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);

  if (!match) {
    return Number.POSITIVE_INFINITY;
  }

  return new Date(2000 + Number(match[3]), Number(match[1]) - 1, Number(match[2])).getTime();
}

function parentRow(element: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = element;

  while (node) {
    if (node.tagName?.toLowerCase() === 'tr') {
      return node;
    }

    node = node.parentNode as HTMLElement | null;
  }

  return null;
}

function rowCells(row: HTMLElement): HTMLElement[] {
  return row.querySelectorAll('td') as HTMLElement[];
}

export async function fetchHtml(url: string, attempt = 1): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Nevada FTC Team Explorer public data collector',
    },
  });

  if (response.status === 429 && attempt < 4) {
    await sleep(attempt * 1500);
    return fetchHtml(url, attempt + 1);
  }

  if (!response.ok) {
    throw new Error(`GET ${url} failed with ${response.status}`);
  }

  return response.text();
}

type FirstSearchTeam = {
  team_number_yearly?: string;
  team_nickname?: string;
  team_name?: string;
  team_name_calc?: string;
  team_city?: string;
  team_stateprov?: string;
  team_country?: string;
  ff_team_rookieyear?: string;
};

function formatSearchLocation(team: FirstSearchTeam): string {
  const parts = [team.team_city, team.team_stateprov, team.team_country].map((part) => cleanText(part));
  return parts.filter(Boolean).join(', ');
}

export function parseFirstSearchTeams(season: SeasonId, payload: unknown): RegionTeamSeed[] {
  const results =
    payload !== null &&
    typeof payload === 'object' &&
    'results' in payload &&
    Array.isArray((payload as { results: unknown }).results)
      ? (payload as { results: FirstSearchTeam[] }).results
      : [];
  const teams = new Map<number, RegionTeamSeed>();

  for (const hit of results) {
    const number = Number(hit.team_number_yearly);
    const name = cleanText(hit.team_nickname || hit.team_name);

    if (!number || !name) {
      continue;
    }

    const location = formatSearchLocation(hit);
    const locationParts = parseLocation(location);
    const organization = normalizeOrganizationText(hit.team_name_calc ?? null);

    teams.set(number, {
      season,
      number,
      name,
      location,
      ...locationParts,
      rookieYear: Number(hit.ff_team_rookieyear) || null,
      organization,
      sourceUrl: `${BASE_URL}/${season}/team/${number}`,
      seedSource: 'first-search',
    });
  }

  return [...teams.values()].sort((a, b) => a.number - b.number);
}

export async function fetchFirstSearchTeams(season: SeasonId, stateProv: string): Promise<RegionTeamSeed[]> {
  const response = await fetch(FIRST_SEARCH_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      index: 'teams_*',
      query: {
        size: 2000,
        query: {
          bool: {
            must: [
              { match: { profile_year: season } },
              { match: { team_stateprov: stateProv } },
              { match: { ff_program_moniker: 'FTC' } },
            ],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`FIRST Team Search failed with ${response.status}`);
  }

  return parseFirstSearchTeams(season, await response.json());
}

export function parseRegionPage(season: SeasonId, html: string, regionCode: string): ParsedRegion {
  const root = parse(html);
  const teams = new Map<number, RegionTeamSeed>();
  const events = new Map<string, RegionEvent>();
  const leagues = new Map<string, LeagueSeed>();

  for (const link of root.querySelectorAll('a') as HTMLElement[]) {
    const href = link.getAttribute('href') ?? '';
    const teamMatch = href.match(new RegExp(`/${season}/team/(\\d+)`));
    const leagueMatch = href.match(new RegExp(`/${season}/region/${regionCode}/league/([A-Z0-9]+)$`));

    if (teamMatch && cleanText(link.textContent) === teamMatch[1]) {
      const row = parentRow(link);
      const cells = row ? rowCells(row) : [];
      const number = Number(teamMatch[1]);
      const location = cleanText(cells[2]?.textContent);
      const locationParts = parseLocation(location);

      teams.set(number, {
        season,
        number,
        name: cleanText(cells[1]?.textContent),
        location,
        ...locationParts,
        rookieYear: Number(cells[3]?.textContent) || null,
        organization: null,
        sourceUrl: `${BASE_URL}/${season}/team/${number}`,
        seedSource: 'ftc-events',
      });
    }

    if (leagueMatch) {
      const name = cleanText(link.textContent);

      if (name) {
        leagues.set(name, {
          season,
          name,
          sourceUrl: `${BASE_URL}/${season}/region/${regionCode}/league/${leagueMatch[1]}`,
        });
      }
    }

    const eventMatch = href.match(new RegExp(`/${season}/([A-Z][A-Z0-9]+)$`));

    if (eventMatch) {
      const row = parentRow(link);
      const cells = row ? rowCells(row) : [];

      if (cells.length >= 4 && cleanText(cells[0]?.textContent) === eventMatch[1]) {
        const hasLeagueColumn = cells.length >= 5;
        events.set(eventMatch[1], {
          season,
          code: eventMatch[1],
          name: cleanText(cells[1]?.textContent),
          league: hasLeagueColumn ? nullable(cells[2]?.textContent) : null,
          location: cleanText(cells[hasLeagueColumn ? 3 : 2]?.textContent),
          date: cleanText(cells[hasLeagueColumn ? 4 : 3]?.textContent),
          sourceUrl: `${BASE_URL}/${season}/${eventMatch[1]}`,
        });
      }
    }
  }

  return {
    teams: [...teams.values()].sort((a, b) => a.number - b.number),
    events: [...events.values()].sort(
      (a, b) => eventDateSortValue(a.date) - eventDateSortValue(b.date) || a.code.localeCompare(b.code),
    ),
    leagues: [...leagues.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function extractField(text: string, label: string, nextLabels: string[]): string | null {
  const start = text.indexOf(label);

  if (start < 0) {
    return null;
  }

  const rest = text.slice(start + label.length);
  const end = nextLabels
    .map((nextLabel) => rest.indexOf(nextLabel))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  return nullable(rest.slice(0, end ?? rest.length));
}

function parseRecord(value: string | null): RecordSummary | null {
  const match = value?.match(/(\d+)\s*-\s*(\d+)\s*-\s*(\d+)/);

  if (!match) {
    return null;
  }

  const wins = Number(match[1]);
  const losses = Number(match[2]);
  const ties = Number(match[3]);

  return {
    wins,
    losses,
    ties,
    text: `${wins}-${losses}-${ties}`,
  };
}

function parseSeasonSummary(text: string, teamNumber: number, season: SeasonId): string | null {
  return (
    nullable(
      text.match(
        new RegExp(
          `This tab displays only official events that Team ${teamNumber} attended in ${season}\\.\\s*Team ${teamNumber} had a record of\\s*\\d+\\s*-\\s*\\d+\\s*-\\s*\\d+\\s*at their \\d+ official events \\(this includes a Qualification record of \\d+\\s*-\\s*\\d+\\s*-\\s*\\d+ and Playoff record of \\d+\\s*-\\s*\\d+\\)`,
        ),
      )?.[0],
    ) ?? null
  );
}

function numberFromText(value: string | null | undefined): number | null {
  const match = cleanText(value).match(/\d+/);
  return match ? Number(match[0]) : null;
}

function normalizeAwardType(name: string): string {
  return cleanText(name)
    .replace(/\s+(?:1st|2nd|3rd)\s+Place$/i, '')
    .replace(/\s+-\s+(?:Captain|Backup|1st Team Selected|2nd Team Selected|3rd Team Selected)$/i, '')
    .replace(/\s+sponsored by .+$/i, '')
    .trim();
}

function normalizeOrganizationText(value: string | null): string | null {
  const normalized = cleanText(value).replace(/\bHS\b/g, 'High School');
  return normalized || null;
}

function classifyTeamType(name: string, organization: string | null): TeamSeason['teamType'] {
  const combined = `${name} ${organization ?? ''}`.toLowerCase();

  if (/\b(high school|middle school|elementary|academy|school|sch|charter|college|university|campus|high|hs|ms)\b/.test(combined)) {
    return 'school';
  }

  if (/\b(family\/community|community|4-h|scouts|club|foundation|robotics)\b/.test(combined)) {
    return 'non-school';
  }

  return 'unknown';
}

export function classifyTeamLink(url: string): Pick<TeamLink, 'type' | 'label'> {
  const hostname = new URL(url).hostname.replace(/^www\./, '').toLowerCase();

  if (hostname === 'github.com') return { type: 'code', label: 'GitHub' };
  if (hostname === 'gitlab.com') return { type: 'code', label: 'GitLab' };
  if (hostname === 'bitbucket.org') return { type: 'code', label: 'Bitbucket' };
  if (hostname.includes('youtube.com') || hostname === 'youtu.be') return { type: 'video', label: 'YouTube' };
  if (hostname.includes('instagram.com')) return { type: 'social', label: 'Instagram' };
  if (hostname.includes('facebook.com')) return { type: 'social', label: 'Facebook' };
  if (hostname === 'x.com' || hostname.includes('twitter.com')) return { type: 'social', label: 'X / Twitter' };
  if (hostname.includes('tiktok.com')) return { type: 'social', label: 'TikTok' };
  if (hostname.includes('linkedin.com')) return { type: 'social', label: 'LinkedIn' };
  if (hostname.includes('discord.')) return { type: 'community', label: 'Discord' };
  if (hostname.includes('onshape.com')) return { type: 'cad', label: 'Onshape CAD' };
  if (hostname.includes('grabcad.com')) return { type: 'cad', label: 'GrabCAD' };
  if (hostname.includes('thingiverse.com')) return { type: 'cad', label: 'Thingiverse' };
  if (hostname.includes('printables.com')) return { type: 'cad', label: 'Printables' };
  if (hostname.includes('docs.google.com')) return { type: 'docs', label: 'Google Docs' };
  if (hostname.includes('drive.google.com')) return { type: 'docs', label: 'Google Drive' };
  if (hostname.includes('linktr.ee') || hostname.includes('beacons.ai')) return { type: 'link-hub', label: 'Link Hub' };

  return { type: 'website', label: 'Official Website' };
}

export function linkPriority(link: TeamLink): number {
  return {
    website: 0,
    code: 1,
    cad: 2,
    video: 3,
    social: 4,
    community: 5,
    docs: 6,
    'link-hub': 7,
    other: 8,
  }[link.type];
}

export function socialLinkLooksUseful(url: string): boolean {
  const parsed = new URL(url);
  const hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();
  const path = parsed.pathname.replace(/\/$/, '');

  if (hostname.includes('instagram.com')) {
    return path.length > 1 && !path.startsWith('/accounts') && !path.startsWith('/explore');
  }

  if (hostname.includes('facebook.com')) {
    return path.length > 1 && !/^\/(?:help|language|login|home\.php|share)/i.test(path);
  }

  if (hostname.includes('tiktok.com')) {
    return path.startsWith('/@');
  }

  if (hostname === 'x.com' || hostname.includes('twitter.com')) {
    return path.length > 1 && !/^\/(?:home|share|intent)/i.test(path);
  }

  return true;
}

function compactForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function hasRoboticsSignal(value: string): boolean {
  return /\b(ftc|first tech challenge|robotics?|engineering notebook|engineering portfolio|cad|code repo)\b/i.test(value);
}

function isSchoolishName(value: string): boolean {
  return /\b(high school|middle school|elementary|academy|school|sch|charter|college|university|campus|high|hs|ms)\b/i.test(
    value,
  );
}

function teamNameCandidates(team: Team): string[] {
  const names = [
    team.latestName,
    ...(Object.values(team.seasons) as TeamSeason[]).map((season) => season.name),
  ];

  return [
    ...new Set(
      names.flatMap((name) => [
        cleanText(name),
        cleanText(name.replace(/\([^)]*\)/g, '').split(/\s+-\s+/)[0]),
      ]),
    ),
  ].filter((name) => name.length > 0);
}

function significantTeamTokens(team: Team): string[] {
  const excluded = new Set([
    'team',
    'school',
    'middle',
    'high',
    'academy',
    'campus',
    'robotics',
    'robot',
    'ftc',
    'the',
    'and',
    'with',
    'without',
  ]);

  return [
    ...new Set(
      teamNameCandidates(team)
        .filter((name) => !isSchoolishName(name))
        .flatMap((name) => name.toLowerCase().match(/[a-z0-9]+/g) ?? [])
        .filter((token) => token.length >= 4 && !excluded.has(token)),
    ),
  ];
}

function schoolHostedTeamPageSignal(value: string, team: Team): boolean {
  const compactValue = compactForMatch(value);

  if (!/\bteam\b/i.test(value) && !compactValue.includes('team')) {
    return false;
  }

  const excluded = new Set(['team', 'school', 'middle', 'high', 'academy', 'campus', 'hs', 'ms']);
  const tokens = [
    ...new Set(
      teamNameCandidates(team)
        .flatMap((name) => name.toLowerCase().match(/[a-z0-9]+/g) ?? [])
        .filter((token) => token.length >= 4 && !excluded.has(token)),
    ),
  ];

  return tokens.some((token) => compactValue.includes(token) && compactValue.includes('team'));
}

function hasTeamIdentitySignal(value: string, team: Team): boolean {
  const compactValue = compactForMatch(value);

  if (new RegExp(`\\bteam\\s*${team.number}\\b`, 'i').test(value) || compactValue.includes(String(team.number))) {
    return true;
  }

  if (schoolHostedTeamPageSignal(value, team)) {
    return true;
  }

  const candidates = teamNameCandidates(team);

  for (const candidate of candidates) {
    if (isSchoolishName(candidate)) {
      continue;
    }

    const compactCandidate = compactForMatch(candidate);

    if (compactCandidate.length >= 8 && compactValue.includes(compactCandidate)) {
      return true;
    }
  }

  const tokens = significantTeamTokens(team);

  return tokens.length > 1 && tokens.filter((token) => compactValue.includes(token)).length >= 2;
}

export function isTeamRelatedWebsite(url: string, pageText: string, team: Team): boolean {
  const combined = `${url} ${pageText}`;

  if (hasRoboticsSignal(url) || hasRoboticsSignal(pageText)) {
    return true;
  }

  return hasTeamIdentitySignal(combined, team);
}

export function addTeamLink(links: Map<string, TeamLink>, url: string | null, source: string): void {
  if (!url || links.has(url)) {
    return;
  }

  const classified = classifyTeamLink(url);
  links.set(url, {
    ...classified,
    url,
    source,
  });
}

export function shouldKeepDiscoveredLink(
  url: string,
  teamWebsite: string,
  label: string,
  team: Team,
  siteIsTeamRelated: boolean,
): boolean {
  const classified = classifyTeamLink(url);
  const urlHost = new URL(url).hostname.replace(/^www\./, '');
  const siteHost = new URL(teamWebsite).hostname.replace(/^www\./, '');
  const linkText = `${url} ${label}`;

  if (classified.type === 'website' || classified.type === 'other' || urlHost === siteHost) {
    return false;
  }

  if (!siteIsTeamRelated && !hasRoboticsSignal(linkText) && !hasTeamIdentitySignal(linkText, team)) {
    return false;
  }

  if (classified.type === 'docs') {
    return /\b(robot|robotics|engineering|notebook|portfolio|code|cad|outreach|team)\b/i.test(label);
  }

  if (classified.type === 'social') {
    return socialLinkLooksUseful(url);
  }

  return true;
}
function parseMatchPoints(segment: string, teamNumber: number): { totalPoints: number | null; matchCount: number } {
  const root = parse(`<div>${segment}</div>`);
  let totalPoints = 0;
  let matchCount = 0;

  for (const row of root.querySelectorAll('tbody tr') as HTMLElement[]) {
    const cells = rowCells(row);

    if (cells.length < 6) {
      continue;
    }

    const teamCells = cells.slice(1, 5);
    const teamIndex = teamCells.findIndex((cell) => cleanText(cell.textContent).split(/\D+/).includes(String(teamNumber)));

    if (teamIndex < 0) {
      continue;
    }

    const scoreCell = cells[cells.length - 1];
    const redScore = numberFromText(scoreCell.querySelector('.danger')?.textContent);
    const blueScore = numberFromText(scoreCell.querySelector('.info')?.textContent);
    const teamScore = teamIndex < 2 ? redScore : blueScore;

    if (teamScore === null) {
      continue;
    }

    totalPoints += teamScore;
    matchCount += 1;
  }

  return {
    totalPoints: matchCount > 0 ? totalPoints : null,
    matchCount,
  };
}

export function parseLeagueRankings(season: SeasonId, league: string, html: string): LeagueRanking[] {
  const root = parse(html);
  const rankings: LeagueRanking[] = [];

  for (const table of root.querySelectorAll('table') as HTMLElement[]) {
    const headers = (table.querySelectorAll('th') as HTMLElement[]).map((cell) =>
      cleanText(cell.textContent).toLowerCase(),
    );

    if (!headers.includes('rank') || !headers.includes('team') || !headers.includes('rs')) {
      continue;
    }

    for (const row of table.querySelectorAll('tr') as HTMLElement[]) {
      const cells = rowCells(row);

      if (cells.length < 7) {
        continue;
      }

      const teamLink = cells[1].querySelector('a') as HTMLElement | null;
      const teamNumber =
        Number(teamLink?.getAttribute('href')?.match(/\/team\/(\d+)/)?.[1]) ||
        Number(cleanText(cells[1].textContent).match(/\b\d{3,5}\b/)?.[0]);
      const rank = Number(cleanText(cells[0].textContent));
      const rankingScore = Number(cleanText(cells[2].textContent));

      if (!teamNumber || !rank || Number.isNaN(rankingScore)) {
        continue;
      }

      rankings.push({
        season,
        league,
        teamNumber,
        rank,
        rankingScore,
        matchPoints: Number(cleanText(cells[3].textContent)) || null,
        plays: Number(cleanText(cells[6].textContent)) || null,
      });
    }
  }

  return rankings;
}

function lastHeadingBefore(html: string, index: number): { text: string; end: number } | null {
  const headingRegex = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  let match: RegExpExecArray | null;
  let last: { text: string; end: number } | null = null;

  while ((match = headingRegex.exec(html))) {
    if (match.index > index) {
      break;
    }

    last = {
      text: stripTags(match[1]),
      end: match.index + match[0].length,
    };
  }

  return last;
}

function nextHeadingIndex(html: string, index: number): number {
  const match = html.slice(index).match(/<h[1-6][^>]*>/i);
  return match?.index === undefined ? html.length : index + match.index;
}

function parseTeamEvents(
  season: SeasonId,
  teamNumber: number,
  html: string,
  regionEvents: Map<string, RegionEvent>,
): TeamEvent[] {
  const events = new Map<string, TeamEvent>();
  const qualificationLinkRegex = new RegExp(
    `<a[^>]+href=["']([^"']*/${season}/([A-Z0-9]+)/qualifications\\?team=${teamNumber})["'][^>]*>[\\s\\S]*?<\\/a>`,
    'gi',
  );
  let match: RegExpExecArray | null;

  while ((match = qualificationLinkRegex.exec(html))) {
    const code = match[2];

    if (events.has(code)) {
      continue;
    }

    const heading = lastHeadingBefore(html, match.index);
    const segmentEnd = nextHeadingIndex(html, match.index + match[0].length);
    const segment = html.slice(heading?.end ?? match.index, segmentEnd);
    const segmentText = stripTags(segment);
    const metadata = regionEvents.get(`${season}:${code}`);
    const playoffHref = segment.match(
      new RegExp(`href=["']([^"']*/${season}/${code}/playoffs\\?team=${teamNumber})["']`, 'i'),
    )?.[1];
    const matchPoints = parseMatchPoints(segment, teamNumber);

    events.set(code, {
      code,
      name: cleanText(heading?.text || metadata?.name || code),
      dateRange:
        nullable(
          segmentText.match(/[A-Z][a-z]+ \d{2}\s+to\s+[A-Z][a-z]+ \d{2}, \d{4}/)?.[0],
        ) ?? metadata?.date ?? null,
      eventOrder: null,
      location: metadata?.location ?? null,
      league: metadata?.league ?? null,
      rank: nullable(segmentText.match(/Rank:\s*(\d+\s+of\s+\d+)/)?.[1]),
      totalPoints: matchPoints.totalPoints,
      matchCount: matchPoints.matchCount,
      rankingScore: null,
      leagueSeasonRank: null,
      leagueSeasonRankTotal: null,
      qualificationUrl: absoluteUrl(match[1]),
      playoffUrl: absoluteUrl(playoffHref),
      playoffRecord: nullable(
        segmentText.match(/Record:\s*(\d+\s+Wins?\s+and\s+\d+\s+Losses?)/)?.[1],
      ),
      allianceSelection: nullable(segmentText.match(/Alliance Selection:\s*([^#]+)/)?.[1]),
      sourceUrl: `${BASE_URL}/${season}/${code}`,
    });
  }

  const root = parse(html);

  for (const pane of root.querySelectorAll('.tab-pane') as HTMLElement[]) {
    const code = pane.getAttribute('id');

    if (!code || code === 'events' || code === 'awards' || events.has(code)) {
      continue;
    }

    if (!/^[A-Z0-9]+$/.test(code)) {
      continue;
    }

    const metadata = regionEvents.get(`${season}:${code}`);
    const paneHtml = pane.toString();
    const paneText = stripTags(paneHtml);
    const name = cleanText(pane.querySelector('h1.panel-title')?.textContent || metadata?.name || code);

    events.set(code, {
      code,
      name,
      dateRange:
        nullable(paneText.match(/[A-Z][a-z]+ \d{2}\s+to\s+[A-Z][a-z]+ \d{2}, \d{4}/)?.[0]) ??
        metadata?.date ??
        null,
      eventOrder: null,
      location: metadata?.location ?? null,
      league: metadata?.league ?? null,
      rank: nullable(paneText.match(/Rank:\s*(\d+\s+of\s+\d+)/)?.[1]),
      totalPoints: null,
      matchCount: 0,
      rankingScore: null,
      leagueSeasonRank: null,
      leagueSeasonRankTotal: null,
      qualificationUrl: null,
      playoffUrl: null,
      playoffRecord: null,
      allianceSelection: null,
      sourceUrl: `${BASE_URL}/${season}/${code}`,
    });
  }

  return [...events.values()];
}

function parseAwards(root: HTMLElement, season: SeasonId): TeamAward[] {
  const awards: TeamAward[] = [];

  for (const table of root.querySelectorAll('table') as HTMLElement[]) {
    const headers = (table.querySelectorAll('th') as HTMLElement[]).map((cell) =>
      cleanText(cell.textContent).toLowerCase(),
    );

    if (!headers.includes('award') || !headers.includes('event')) {
      continue;
    }

    for (const row of table.querySelectorAll('tr') as HTMLElement[]) {
      const cells = rowCells(row);

      if (cells.length < 2) {
        continue;
      }

      const awardLink = cells[0].querySelector('a') as HTMLElement | null;
      const eventLink = cells[1].querySelector('a') as HTMLElement | null;
      const eventUrl = absoluteUrl(eventLink?.getAttribute('href'));
      const eventCode = eventUrl?.match(new RegExp(`/${season}/([A-Z0-9]+)$`))?.[1] ?? null;

      awards.push({
        name: cleanText(cells[0].textContent),
        awardType: normalizeAwardType(cleanText(cells[0].textContent)),
        eventName: cleanText(cells[1].textContent),
        eventCode,
        awardUrl: absoluteUrl(awardLink?.getAttribute('href')),
        eventUrl,
      });
    }
  }

  return awards;
}

export function parseTeamSeason(
  seed: RegionTeamSeed,
  html: string,
  regionEvents: Map<string, RegionEvent>,
  options?: { retrievedAt?: string | null },
): TeamSeason {
  const root = parse(html);
  const text = cleanText(root.structuredText);
  const h1 = cleanText(root.querySelector('h1')?.textContent);
  const titleMatch = h1.match(/Team\s+(\d+)\s+-\s+(.+?)\s+\(\d{4}\)/);
  const name = titleMatch?.[2] ?? seed.name;
  const location =
    extractField(text, 'From:', ['Region:', 'League Membership:', 'Rookie Year:']) ??
    seed.location;
  const locationParts = parseLocation(location);
  const summary = parseSeasonSummary(text, seed.number, seed.season);
  const record = parseRecord(text.match(/had a record of\s+(\d+\s*-\s*\d+\s*-\s*\d+)/)?.[1] ?? null);
  const qualificationRecord = parseRecord(
    text.match(/Qualification record of\s+(\d+\s*-\s*\d+\s*-\s*\d+)/)?.[1] ?? null,
  );
  const playoffRecord = parseRecord(
    text.match(/Playoff record of\s+(\d+\s*-\s*\d+\s*-\s*\d+)/)?.[1] ?? null,
  );
  const events = parseTeamEvents(seed.season, seed.number, html, regionEvents);
  const awards = parseAwards(root, seed.season);
  const organization = normalizeOrganizationText(
    extractField(text, `${seed.season} Sponsors:`, [
      'Team Summary',
      'Other Seasons',
      'All Events',
      'This team',
      'To update listed skills',
    ]),
  );
  const retrievedAt = options?.retrievedAt ?? new Date().toISOString();
  const affiliations = parseOrganizationAffiliations(organization, {
    season: seed.season,
    source: 'ftc-events-sponsors',
    retrievedAt,
  });

  const season: TeamSeason = {
    season: seed.season,
    active: true,
    name,
    location,
    ...locationParts,
    region: extractField(text, 'Region:', ['League Membership:', 'Rookie Year:']),
    league: extractField(text, 'League Membership:', ['Rookie Year:', 'On The Web:', `${seed.season} Robot:`, `${seed.season} Sponsors:`]),
    rookieYear: Number(extractField(text, 'Rookie Year:', ['On The Web:', `${seed.season} Robot:`, `${seed.season} Sponsors:`])) || seed.rookieYear,
    organization,
    affiliations,
    teamType: classifyTeamType(name, organization),
    website: normalizeExternalUrl(
      extractField(text, 'On The Web:', [`${seed.season} Robot:`, `${seed.season} Sponsors:`, 'This team', 'Other Seasons']),
    ),
    robot: extractField(text, `${seed.season} Robot:`, [`${seed.season} Sponsors:`, 'This team', 'Other Seasons']),
    sourceUrl: seed.sourceUrl,
    summary,
    record,
    qualificationRecord,
    playoffRecord,
    events,
    awards,
    notes: events.length === 0 ? ['No public event rows were parsed from this season page.'] : [],
  };

  season.evidence = buildSeasonEvidence(season, {
    sourceType: 'ftc-events-team-page',
    sourceUrl: seed.sourceUrl,
    retrievedAt,
    extractionMethod: 'html-field',
    nameMethod: titleMatch ? 'html-title' : 'seed-fallback',
    organizationMethod: 'html-field',
  });

  return season;
}

export function parseRegionTitle(html: string): string | null {
  const match = html.match(/<h1[^>]*>([^<]+)/i);
  return nullable(match?.[1]);
}

export function seasonFromSeed(seed: RegionTeamSeed, note: string, regionLabel = 'Region'): TeamSeason {
  const organization = seed.organization;
  const affiliationSource = seed.seedSource === 'first-search' ? 'first-search' : 'ftc-events-sponsors';
  const evidenceSourceType = seed.seedSource === 'first-search' ? 'first-search' : 'ftc-events-team-page';
  const affiliations = parseOrganizationAffiliations(organization, {
    season: seed.season,
    source: affiliationSource,
  });
  const notes =
    seed.seedSource === 'first-search'
      ? [
          'Team seeded from public FIRST Team Search because FTC Events Nevada region pages are not published for this season yet.',
          note,
        ]
      : [note];

  const season: TeamSeason = {
    season: seed.season,
    active: true,
    name: seed.name,
    location: seed.location,
    city: seed.city,
    state: seed.state,
    country: seed.country,
    region: regionLabel,
    league: null,
    rookieYear: seed.rookieYear,
    organization,
    affiliations,
    teamType: classifyTeamType(seed.name, organization),
    website: null,
    robot: null,
    sourceUrl: seed.sourceUrl,
    summary: null,
    record: null,
    qualificationRecord: null,
    playoffRecord: null,
    events: [],
    awards: [],
    notes,
  };

  season.evidence = buildSeasonEvidence(season, {
    sourceType: evidenceSourceType,
    sourceUrl: seed.sourceUrl,
    retrievedAt: null,
    extractionMethod: seed.seedSource === 'first-search' ? 'search-index' : 'region-seed',
    nameMethod: seed.seedSource === 'first-search' ? 'search-index' : 'region-seed',
    organizationMethod: seed.seedSource === 'first-search' ? 'search-index' : 'region-seed',
  });

  return season;
}

export function mergeSeason(teamMap: Map<number, Team>, teamNumber: number, season: TeamSeason): void {
  const existing = teamMap.get(teamNumber);

  if (existing) {
    const prior = existing.seasons[season.season];
    existing.seasons[season.season] = prior
      ? {
          ...season,
          evidence: mergeSeasonEvidence(prior.evidence, season.evidence),
        }
      : season;
    return;
  }

  teamMap.set(teamNumber, {
    number: teamNumber,
    latestName: season.name,
    latestLocation: season.location,
    latestCity: season.city,
    latestState: season.state,
    latestCountry: season.country,
    latestRookieYear: season.rookieYear,
    latestOrganization: season.organization,
    latestWebsite: season.website,
    latestTeamType: season.teamType,
    latestLeague: season.league,
    latestRegion: season.region,
    links: [],
    seasons: {
      [season.season]: season,
    },
  });
}

export function refreshLatestFields(team: Team): Team {
  const latestSeason = TARGET_SEASONS.find((season) => team.seasons[season]);
  const season = latestSeason ? team.seasons[latestSeason] : undefined;

  if (!season) {
    return team;
  }

  return {
    ...team,
    latestName: season.name,
    latestLocation: season.location,
    latestCity: season.city,
    latestState: season.state,
    latestCountry: season.country,
    latestRookieYear: season.rookieYear,
    latestOrganization: season.organization,
    latestWebsite: season.website,
    latestTeamType: season.teamType,
    latestLeague: season.league,
    latestRegion: season.region,
  };
}

export function applyLeagueRankings(
  teams: Team[],
  regionEvents: Map<string, RegionEvent>,
  leagueRankings: Map<string, LeagueRanking>,
): void {
  const eventOrder = new Map<string, number>();

  for (const season of TARGET_SEASONS) {
    [...regionEvents.values()]
      .filter((event) => event.season === season)
      .forEach((event, index) => {
        eventOrder.set(`${season}:${event.code}`, index + 1);
      });
  }

  for (const team of teams) {
    for (const season of Object.values(team.seasons) as TeamSeason[]) {
      season.events.forEach((event, index) => {
        event.eventOrder =
          (event.code ? eventOrder.get(`${season.season}:${event.code}`) : undefined) ?? 1000 + index;
      });

      const ranking = season.league
        ? leagueRankings.get(`${season.season}:${season.league}:${team.number}`)
        : undefined;

      if (ranking) {
        for (const event of season.events) {
          event.rankingScore = ranking.rankingScore;
          event.leagueSeasonRank = ranking.rank;
          event.leagueSeasonRankTotal = [...leagueRankings.values()].filter(
            (item) => item.season === season.season && item.league === season.league,
          ).length;
        }
      }
    }
  }
}

export async function discoverLinksForWebsite(teamWebsite: string, team: Team): Promise<TeamLink[]> {
  const links = new Map<string, TeamLink>();
  const websiteType = classifyTeamLink(teamWebsite).type;

  if (websiteType !== 'website' && websiteType !== 'link-hub') {
    if (websiteType !== 'social' || socialLinkLooksUseful(teamWebsite)) {
      addTeamLink(links, teamWebsite, 'FTC Events On The Web');
    }

    return [...links.values()];
  }

  let siteIsTeamRelated = isTeamRelatedWebsite(teamWebsite, '', team);

  try {
    const response = await fetch(teamWebsite, {
      headers: { 'user-agent': 'Nevada FTC Team Explorer public link discovery' },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      if (siteIsTeamRelated) {
        addTeamLink(links, teamWebsite, 'FTC Events On The Web');
      }

      return [...links.values()];
    }

    const contentType = response.headers.get('content-type') ?? '';

    if (!contentType.includes('text/html')) {
      if (siteIsTeamRelated) {
        addTeamLink(links, teamWebsite, 'FTC Events On The Web');
      }

      return [...links.values()];
    }

    const root = parse(await response.text());
    const pageHeadingText = cleanText(
      [root.querySelector('title')?.textContent, root.querySelector('h1')?.textContent].join(' '),
    );
    siteIsTeamRelated = isTeamRelatedWebsite(teamWebsite, pageHeadingText, team);

    if (siteIsTeamRelated) {
      addTeamLink(links, teamWebsite, 'FTC Events On The Web');
    }

    for (const anchor of root.querySelectorAll('a') as HTMLElement[]) {
      const href = anchor.getAttribute('href') ?? '';

      if (/refer=embed/i.test(href)) {
        continue;
      }

      const url = normalizeExternalUrl(href, teamWebsite);
      const anchorText = cleanText(anchor.textContent);

      if (!url || !shouldKeepDiscoveredLink(url, teamWebsite, anchorText, team, siteIsTeamRelated)) {
        continue;
      }

      addTeamLink(links, url, 'Team website');
    }
  } catch {
    if (siteIsTeamRelated) {
      addTeamLink(links, teamWebsite, 'FTC Events On The Web');
    }

    return [...links.values()];
  }

  return [...links.values()].sort((a, b) => linkPriority(a) - linkPriority(b) || a.label.localeCompare(b.label));
}

export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  handler: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await handler(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}
