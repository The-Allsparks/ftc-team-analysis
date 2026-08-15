import {
  AffiliationConfidence,
  OrganizationEntityType,
  SeasonId,
  TeamAffiliation,
  TeamSeason,
} from '../data/schema';

export type AffiliationSource =
  | 'ftc-events-sponsors'
  | 'first-search'
  | 'organization-backfill';

export type ParseOrganizationOptions = {
  season: SeasonId;
  source?: AffiliationSource | string;
  retrievedAt?: string | null;
};

/** Ampersand patterns that are part of a name, not sponsor/host delimiters. */
const PROTECTED_AMPERSAND_PATTERNS: Array<{ pattern: RegExp; token: string }> = [
  { pattern: /\bBoys\s*&\s*Girls\b/gi, token: 'Boys __AMP__ Girls' },
  { pattern: /\bMario\s+C\s*&\s*Joanne\b/gi, token: 'Mario C __AMP__ Joanne' },
  { pattern: /\bV\s*&\s*T\b/gi, token: 'V __AMP__ T' },
  { pattern: /\bC\s*&\s*F\b/gi, token: 'C __AMP__ F' },
];

function restoreProtectedAmps(value: string): string {
  return value.replace(/__AMP__/g, '&');
}

function protectEmbeddedAmps(value: string): string {
  let next = value;
  for (const { pattern, token } of PROTECTED_AMPERSAND_PATTERNS) {
    next = next.replace(pattern, token);
  }
  return next;
}

function trimSegment(value: string): string {
  return restoreProtectedAmps(value).replace(/\s+/g, ' ').trim();
}

function isSchoolish(value: string): boolean {
  return /\b(high school|middle school|elementary|junior high|academy|charter|college|university|campus|school|sch|hs|ms)\b/i.test(
    value,
  );
}

function isTeamAffiliationHost(value: string): boolean {
  const normalized = value.toLowerCase().replace(/\s+/g, ' ').trim();
  return (
    normalized === 'family/community' ||
    normalized === 'family / community' ||
    normalized === 'home school' ||
    normalized === 'homeschool' ||
    /^family\s*\/\s*community$/i.test(value.trim())
  );
}

function isCommunityOrganization(value: string): boolean {
  const normalized = value.toLowerCase().replace(/\s+/g, ' ').trim();
  if (/\b4\s*-?\s*h\b/.test(normalized) || normalized.includes('4-h')) {
    return true;
  }
  if (/boys\s*&\s*girls|boys and girls/.test(normalized)) {
    return true;
  }
  return false;
}

function classifyHost(name: string): {
  entityType: OrganizationEntityType;
  confidence: AffiliationConfidence;
} {
  if (isTeamAffiliationHost(name)) {
    return { entityType: 'team_affiliation', confidence: 'high' };
  }
  if (isCommunityOrganization(name)) {
    return { entityType: 'community_organization', confidence: 'high' };
  }
  if (isSchoolish(name)) {
    return { entityType: 'school', confidence: 'high' };
  }
  return { entityType: 'host_organization', confidence: 'medium' };
}

function splitSponsors(left: string): string[] {
  return left
    .split('/')
    .map((part) => trimSegment(part))
    .filter(Boolean);
}

function splitHostPieces(right: string): string[] {
  const protectedRight = protectEmbeddedAmps(right);
  return protectedRight
    .split('&')
    .map((part) => trimSegment(part))
    .filter(Boolean);
}

function makeAffiliation(
  opts: ParseOrganizationOptions,
  sourceText: string,
  entityType: OrganizationEntityType,
  name: string,
  confidence: AffiliationConfidence,
): TeamAffiliation {
  return {
    entityType,
    name,
    season: opts.season,
    source: opts.source ?? 'organization-backfill',
    retrievedAt: opts.retrievedAt ?? null,
    confidence,
    confirmationState: confidence === 'low' ? 'unconfirmed' : 'unconfirmed',
    sourceText,
  };
}

/**
 * Split a FIRST public sponsor/organization line into typed affiliations.
 * Always preserves the full original string on each row as `sourceText`.
 */
export function parseOrganizationAffiliations(
  organization: string | null | undefined,
  opts: ParseOrganizationOptions,
): TeamAffiliation[] {
  const sourceText = (organization ?? '').trim();
  if (!sourceText) {
    return [];
  }

  const protectedText = protectEmbeddedAmps(sourceText);
  const lastAmp = protectedText.lastIndexOf('&');
  const affiliations: TeamAffiliation[] = [];

  if (lastAmp === -1) {
    // Slash-only "Family/Community" (no host delimiter) is a team affiliation.
    if (isTeamAffiliationHost(sourceText) || sourceText.replace(/\s+/g, '') === 'Family/Community') {
      affiliations.push(
        makeAffiliation(opts, sourceText, 'team_affiliation', trimSegment(sourceText), 'high'),
      );
      return affiliations;
    }

    const { entityType, confidence } = classifyHost(sourceText);
    affiliations.push(makeAffiliation(opts, sourceText, entityType, trimSegment(sourceText), confidence));
    return affiliations;
  }

  const leftRaw = protectedText.slice(0, lastAmp);
  const rightRaw = protectedText.slice(lastAmp + 1);
  const sponsors: string[] = [];
  const hosts: string[] = [...splitHostPieces(rightRaw)];

  // Left of the final host delimiter may still contain unprotected `&`
  // (e.g. sponsors&4-H&Family/Community). Slash chunks are sponsors;
  // school/community/affiliation-looking pieces become additional hosts.
  for (const leftPart of leftRaw.split('&').map((part) => trimSegment(part)).filter(Boolean)) {
    if (leftPart.includes('/')) {
      sponsors.push(...splitSponsors(protectEmbeddedAmps(leftPart)));
      continue;
    }
    const hostClass = classifyHost(leftPart);
    if (
      hostClass.entityType === 'school' ||
      hostClass.entityType === 'community_organization' ||
      hostClass.entityType === 'team_affiliation'
    ) {
      hosts.unshift(leftPart);
    } else {
      sponsors.push(leftPart);
    }
  }

  const ambiguousHosts = hosts.length > 1;

  for (const sponsor of sponsors) {
    affiliations.push(
      makeAffiliation(
        opts,
        sourceText,
        'sponsor',
        sponsor,
        hosts.length > 0 ? 'high' : 'medium',
      ),
    );
  }

  for (const host of hosts) {
    const { entityType, confidence } = classifyHost(host);
    affiliations.push(
      makeAffiliation(
        opts,
        sourceText,
        entityType,
        host,
        ambiguousHosts ? 'low' : confidence,
      ),
    );
  }

  // Leading "&School" with no sponsors is fine; empty left yields no sponsors.
  if (affiliations.length === 0) {
    affiliations.push(
      makeAffiliation(opts, sourceText, 'host_organization', trimSegment(sourceText), 'low'),
    );
  }

  return affiliations;
}

/** Prefer stored affiliations; otherwise derive from raw organization text. */
export function affiliationsForSeason(
  season: Pick<TeamSeason, 'season' | 'organization' | 'affiliations'>,
  source: AffiliationSource | string = 'organization-backfill',
): TeamAffiliation[] {
  if (season.affiliations && season.affiliations.length > 0) {
    return season.affiliations;
  }
  return parseOrganizationAffiliations(season.organization, {
    season: season.season,
    source,
  });
}

export function ensureSeasonAffiliations(
  season: TeamSeason,
  source: AffiliationSource | string = 'organization-backfill',
  retrievedAt: string | null = null,
): TeamSeason {
  if (!season.organization) {
    return { ...season, affiliations: season.affiliations ?? [] };
  }
  if (season.affiliations && season.affiliations.length > 0) {
    return season;
  }
  return {
    ...season,
    affiliations: parseOrganizationAffiliations(season.organization, {
      season: season.season,
      source,
      retrievedAt,
    }),
  };
}

export function schoolAffiliations(season: Pick<TeamSeason, 'season' | 'organization' | 'affiliations'>): TeamAffiliation[] {
  return affiliationsForSeason(season).filter((row) => row.entityType === 'school');
}

export function sponsorAffiliations(season: Pick<TeamSeason, 'season' | 'organization' | 'affiliations'>): TeamAffiliation[] {
  return affiliationsForSeason(season).filter((row) => row.entityType === 'sponsor');
}

export function hostAffiliations(season: Pick<TeamSeason, 'season' | 'organization' | 'affiliations'>): TeamAffiliation[] {
  return affiliationsForSeason(season).filter((row) =>
    row.entityType === 'school' ||
    row.entityType === 'community_organization' ||
    row.entityType === 'team_affiliation' ||
    row.entityType === 'host_organization',
  );
}
