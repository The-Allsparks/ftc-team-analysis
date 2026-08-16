import type { Team, TeamLink } from '../data/schema';
import { classifyTeamLink, linkPriority } from './ftcParsers';
import {
  isAllowedPublicTeamLink,
  normalizeLinkUrl,
  upsertTeamLink,
} from './linkDiscovery';

/** Confirmed public API host from OA frontend `API_URL` + FTCOA-API routes. */
export const OPEN_ALLIANCE_API_BASE = 'https://api.theopenalliance.org';
/** Human listing page (enrichment attribution; not competitive records). */
export const OPEN_ALLIANCE_FTC_LISTING_URL = 'https://theopenalliance.org/ftc/teams';
export const OPEN_ALLIANCE_SOURCE = 'Open Alliance (team-declared)';
export const OPEN_ALLIANCE_USER_AGENT = 'Nevada FTC Team Explorer Open Alliance enrichment';

/**
 * Team-declared resource fields from `GET /teams/ftc` (FTCOA-API `getTeamList`).
 * Awards fields may appear upstream but are intentionally ignored for competitive use.
 */
export type OpenAllianceFtcTeam = {
  TeamNumber: string | number;
  TeamID?: string | null;
  TeamName?: string | null;
  Location?: string | null;
  TeamWebsite?: string | null;
  BuildThread?: string | null;
  CAD?: string | null;
  Code?: string | null;
  Photo?: string | null;
  Video?: string | null;
  NewestAwardYear?: number | string | null;
  NewestAward?: string | null;
};

export type OpenAllianceResourceField =
  | 'BuildThread'
  | 'CAD'
  | 'Code'
  | 'Photo'
  | 'Video'
  | 'TeamWebsite';

const RESOURCE_FIELDS: Array<{
  field: OpenAllianceResourceField;
  preferredType?: TeamLink['type'];
  preferredLabel: string;
}> = [
  { field: 'BuildThread', preferredType: 'community', preferredLabel: 'Build Thread' },
  { field: 'CAD', preferredType: 'cad', preferredLabel: 'CAD' },
  { field: 'Code', preferredType: 'code', preferredLabel: 'Code' },
  { field: 'Video', preferredType: 'video', preferredLabel: 'Video' },
  { field: 'Photo', preferredLabel: 'Photos' },
  { field: 'TeamWebsite', preferredType: 'website', preferredLabel: 'Team Website' },
];

export type ApplyOpenAllianceResult = {
  matchedTeams: number;
  linksAdded: number;
  skippedNonExact: number;
};

/**
 * Exact numeric team number only (1–5 digits). Rejects name tokens, suffixes, and FTC prefixes.
 */
export function parseOpenAllianceTeamNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value <= 0 || value > 99999) {
      return null;
    }
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!/^\d{1,5}$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function teamIdMatchesExactNumber(teamId: string | null | undefined, teamNumber: number): boolean {
  if (!teamId) {
    return true;
  }
  return teamId.trim().toUpperCase() === `FTC${teamNumber}`;
}

export function openAllianceTeamPageUrl(teamNumber: number): string {
  return `${OPEN_ALLIANCE_FTC_LISTING_URL}/${teamNumber}`;
}

export function isOpenAllianceLinkSource(source: string | null | undefined): boolean {
  return Boolean(source && /open alliance/i.test(source));
}

export function openAllianceLinkAttribution(link: Pick<TeamLink, 'source' | 'evidence'>): string {
  const parts = [link.source, link.evidence].filter(Boolean);
  return parts.join(' · ');
}

/**
 * Validate and normalize a raw `/teams/ftc` JSON array. Drops rows without an exact TeamNumber.
 * Does not match by TeamName.
 */
export function parseOpenAllianceFtcListings(raw: unknown): {
  listings: OpenAllianceFtcTeam[];
  skippedNonExact: number;
} {
  if (!Array.isArray(raw)) {
    throw new Error('Open Alliance FTC team list must be a JSON array');
  }

  const listings: OpenAllianceFtcTeam[] = [];
  let skippedNonExact = 0;

  for (const row of raw) {
    if (!row || typeof row !== 'object') {
      skippedNonExact += 1;
      continue;
    }

    const candidate = row as OpenAllianceFtcTeam;
    const teamNumber = parseOpenAllianceTeamNumber(candidate.TeamNumber);
    if (teamNumber == null) {
      skippedNonExact += 1;
      continue;
    }

    if (!teamIdMatchesExactNumber(candidate.TeamID, teamNumber)) {
      skippedNonExact += 1;
      continue;
    }

    listings.push({
      ...candidate,
      TeamNumber: String(teamNumber),
    });
  }

  return { listings, skippedNonExact };
}

function resourceEvidence(teamNumber: number, field: OpenAllianceResourceField): string {
  return (
    `Exact team number match on Open Alliance FTC listing ` +
    `(${openAllianceTeamPageUrl(teamNumber)}); ` +
    `team-declared ${field}; original resource URL preserved. ` +
    `Enrichment only — not an official competitive result.`
  );
}

/**
 * Map OA declared resource URLs to TeamLink entries. Preserves original URLs (after
 * shared normalization). Never emits award/competitive rows from NewestAward*.
 */
export function teamLinksFromOpenAllianceListing(
  listing: OpenAllianceFtcTeam,
  options: { teamNumber: number; retrievedAt?: string | null },
): TeamLink[] {
  const teamNumber = options.teamNumber;
  const links = new Map<string, TeamLink>();
  const retrievedAt = options.retrievedAt ?? null;

  for (const resource of RESOURCE_FIELDS) {
    const rawUrl = listing[resource.field];
    if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
      continue;
    }

    const url = normalizeLinkUrl(rawUrl);
    if (!url || !isAllowedPublicTeamLink(url)) {
      continue;
    }

    const classified = classifyTeamLink(url);
    // Prefer classifier when it recognizes the host; otherwise use OA field semantics.
    const type =
      classified.type !== 'website' ? classified.type : resource.preferredType ?? classified.type;
    const label =
      resource.field === 'BuildThread' && (classified.type === 'community' || classified.type === 'website')
        ? resource.preferredLabel
        : classified.type !== 'website'
          ? classified.label
          : resource.preferredLabel;

    upsertTeamLink(links, url, {
      source: OPEN_ALLIANCE_SOURCE,
      ownershipConfidence: 'high',
      confirmationState: 'unconfirmed',
      evidence: resourceEvidence(teamNumber, resource.field),
      notes: `Open Alliance team-declared ${resource.field}`,
      retrievedAt,
      liveness: 'unknown',
    });

    const stored = links.get(url);
    if (stored) {
      stored.type = type;
      stored.label = label;
      stored.source = OPEN_ALLIANCE_SOURCE;
    }
  }

  return [...links.values()].sort(
    (a, b) => linkPriority(a) - linkPriority(b) || a.label.localeCompare(b.label),
  );
}

/**
 * Attach OA resources only when `listing.TeamNumber` exactly equals `team.number`.
 * Name-only / fuzzy association is rejected.
 */
export function applyOpenAllianceEnrichment(
  teams: Team[],
  listings: OpenAllianceFtcTeam[],
  options?: { retrievedAt?: string | null },
): ApplyOpenAllianceResult {
  const byNumber = new Map<number, OpenAllianceFtcTeam>();
  let skippedNonExact = 0;

  for (const listing of listings) {
    const teamNumber = parseOpenAllianceTeamNumber(listing.TeamNumber);
    if (teamNumber == null || !teamIdMatchesExactNumber(listing.TeamID, teamNumber)) {
      skippedNonExact += 1;
      continue;
    }
    byNumber.set(teamNumber, listing);
  }

  let matchedTeams = 0;
  let linksAdded = 0;
  const retrievedAt = options?.retrievedAt ?? null;

  for (const team of teams) {
    const listing = byNumber.get(team.number);
    if (!listing) {
      continue;
    }

    matchedTeams += 1;
    const linkMap = new Map<string, TeamLink>((team.links ?? []).map((link) => [link.url, link]));
    const before = linkMap.size;

    for (const link of teamLinksFromOpenAllianceListing(listing, {
      teamNumber: team.number,
      retrievedAt,
    })) {
      const existing = linkMap.get(link.url);
      if (!existing) {
        linkMap.set(link.url, link);
        continue;
      }

      // Prefer OA attribution when the URL was already known from weaker discovery.
      const next: TeamLink = {
        ...existing,
        ...link,
        ownershipConfidence:
          existing.ownershipConfidence === 'high' || link.ownershipConfidence === 'high'
            ? 'high'
            : link.ownershipConfidence ?? existing.ownershipConfidence,
        source: OPEN_ALLIANCE_SOURCE,
        evidence: link.evidence ?? existing.evidence,
        notes: link.notes ?? existing.notes,
      };
      linkMap.set(link.url, next);
    }

    linksAdded += Math.max(0, linkMap.size - before);
    team.links = [...linkMap.values()].sort(
      (a, b) => linkPriority(a) - linkPriority(b) || a.label.localeCompare(b.label),
    );
  }

  return { matchedTeams, linksAdded, skippedNonExact };
}

export async function fetchOpenAllianceFtcTeamList(options?: {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<{ listings: OpenAllianceFtcTeam[]; skippedNonExact: number }> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const response = await fetchImpl(`${OPEN_ALLIANCE_API_BASE}/teams/ftc`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': OPEN_ALLIANCE_USER_AGENT,
    },
    signal: options?.signal,
  });

  if (!response.ok) {
    throw new Error(`Open Alliance /teams/ftc failed with HTTP ${response.status}`);
  }

  const raw: unknown = await response.json();
  return parseOpenAllianceFtcListings(raw);
}
