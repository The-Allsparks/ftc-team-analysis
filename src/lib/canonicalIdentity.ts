/**
 * Canonical identity enrichment for locations and affiliations (#16).
 * Fail-soft: never invents external IDs; ambiguous NCES hits are quarantined.
 */
import {
  AMBIGUOUS_SCHOOL_KEYS,
  NCES_SCHOOL_CATALOG,
  type NcesCatalogEntry,
} from '../data/ncesSchoolCatalog';
import type {
  CanonicalIdentifier,
  IdentityMatchStatus,
  NameAlias,
  NormalizedLocation,
  Team,
  TeamAffiliation,
  TeamSeason,
} from '../data/schema';
import { affiliationsForSeason } from './organizationAffiliations';
import {
  normalizeCountryCode,
  normalizeOrganizationName,
  normalizeStateCode,
  parseLocationString,
  slugifyOrganizationName,
  US_STATE_TO_ISO3166_2,
} from './canonicalNormalization';

export type CatalogLookupOptions = {
  catalog?: readonly NcesCatalogEntry[];
  ambiguousKeys?: ReadonlySet<string>;
  /** Postal state hint (USPS) for disambiguation. */
  stateCode?: string | null;
};

export type SchoolIdentityMatch = {
  status: IdentityMatchStatus;
  entry: NcesCatalogEntry | null;
  identifiers: CanonicalIdentifier[];
  aliases: NameAlias[];
};

function catalogKeysForEntry(entry: NcesCatalogEntry): string[] {
  const keys = new Set<string>(entry.matchKeys.map((key) => normalizeOrganizationName(key)));
  for (const alias of entry.aliases ?? []) {
    keys.add(normalizeOrganizationName(alias));
  }
  keys.add(normalizeOrganizationName(entry.displayName));
  return [...keys].filter(Boolean);
}

function identifiersFromEntry(entry: NcesCatalogEntry): CanonicalIdentifier[] {
  const rows: CanonicalIdentifier[] = [];
  if (entry.ncesSch) {
    rows.push({
      idNamespace: 'nces-sch',
      canonicalId: entry.ncesSch,
      confidence: entry.confidence,
      evidence: entry.evidenceUrl,
      source: 'nces-ccd-catalog',
    });
  }
  if (entry.ncesLea) {
    rows.push({
      idNamespace: 'nces-lea',
      canonicalId: entry.ncesLea,
      confidence: entry.confidence,
      evidence: entry.evidenceUrl,
      source: 'nces-ccd-catalog',
    });
  }
  if (entry.ncesPss) {
    rows.push({
      idNamespace: 'nces-pss',
      canonicalId: entry.ncesPss,
      confidence: entry.confidence,
      evidence: entry.evidenceUrl,
      source: 'nces-pss-catalog',
    });
  }
  return rows;
}

function aliasesFromEntry(entry: NcesCatalogEntry, normalizedName: string): NameAlias[] {
  const aliases: NameAlias[] = [{ name: normalizedName, kind: 'normalized' }];
  for (const alias of entry.aliases ?? []) {
    aliases.push({ name: alias, kind: 'alias' });
  }
  if (normalizeOrganizationName(entry.displayName) !== normalizedName) {
    aliases.push({ name: entry.displayName, kind: 'alias' });
  }
  return aliases;
}

/**
 * Look up a school/org name in the curated catalog.
 * Multiple hits or known-ambiguous keys → quarantine (no external IDs).
 */
export function matchSchoolIdentity(
  name: string,
  options: CatalogLookupOptions = {},
): SchoolIdentityMatch {
  const normalized = normalizeOrganizationName(name);
  const catalog = options.catalog ?? NCES_SCHOOL_CATALOG;
  const ambiguousKeys = options.ambiguousKeys ?? AMBIGUOUS_SCHOOL_KEYS;
  const stateHint = normalizeStateCode(options.stateCode ?? null);

  if (!normalized) {
    return { status: 'unmatched', entry: null, identifiers: [], aliases: [] };
  }

  if (ambiguousKeys.has(normalized)) {
    return {
      status: 'quarantined',
      entry: null,
      identifiers: [],
      aliases: [{ name: normalized, kind: 'normalized' }],
    };
  }

  const hits = catalog.filter((entry) => {
    const keys = catalogKeysForEntry(entry);
    if (!keys.includes(normalized)) {
      return false;
    }
    if (stateHint && entry.stateCodes.length > 0 && !entry.stateCodes.includes(stateHint)) {
      return false;
    }
    return true;
  });

  if (hits.length === 0) {
    return {
      status: 'unmatched',
      entry: null,
      identifiers: [],
      aliases: [{ name: normalized, kind: 'normalized' }],
    };
  }

  if (hits.length > 1) {
    return {
      status: 'ambiguous',
      entry: null,
      identifiers: [],
      aliases: [{ name: normalized, kind: 'normalized' }],
    };
  }

  const entry = hits[0]!;
  return {
    status: 'matched',
    entry,
    identifiers: identifiersFromEntry(entry),
    aliases: aliasesFromEntry(entry, normalized),
  };
}

export function buildRegisteredLocation(
  season: Pick<TeamSeason, 'location' | 'city' | 'state' | 'country' | 'registeredLocation'>,
): NormalizedLocation {
  if (season.registeredLocation) {
    return season.registeredLocation;
  }

  const parsed = parseLocationString(season.location);
  const city = season.city?.trim() || parsed.city;
  const stateCode = normalizeStateCode(season.state) ?? parsed.stateCode;
  const countryCode = normalizeCountryCode(season.country) ?? parsed.countryCode ?? (stateCode ? 'US' : null);
  const subdivisionCode =
    countryCode === 'US' && stateCode && US_STATE_TO_ISO3166_2[stateCode]
      ? US_STATE_TO_ISO3166_2[stateCode]!
      : parsed.subdivisionCode;

  const identifiers: CanonicalIdentifier[] = [];
  if (countryCode) {
    identifiers.push({
      idNamespace: 'iso-3166-1',
      canonicalId: countryCode,
      confidence: 'high',
      source: 'location-parse',
      evidence: season.location || null,
    });
  }
  if (subdivisionCode) {
    identifiers.push({
      idNamespace: 'iso-3166-2',
      canonicalId: subdivisionCode,
      confidence: 'high',
      source: 'location-parse',
      evidence: season.location || null,
    });
  }

  return {
    normalizedName: parsed.normalizedName || null,
    city,
    stateCode,
    countryCode,
    subdivisionCode,
    rawLocation: season.location || null,
    geo: null,
    identifiers: identifiers.length > 0 ? identifiers : undefined,
  };
}

/**
 * Enrich a single affiliation with normalized name, slug, and optional NCES IDs.
 * Never invents external IDs when unmatched / ambiguous / quarantined.
 */
export function enrichAffiliationIdentity(
  affiliation: TeamAffiliation,
  options: CatalogLookupOptions = {},
): TeamAffiliation {
  const normalizedName = affiliation.normalizedName ?? normalizeOrganizationName(affiliation.name);
  const slug = affiliation.slug ?? slugifyOrganizationName(affiliation.name);

  const shouldMatch =
    affiliation.entityType === 'school' ||
    affiliation.entityType === 'school_district' ||
    affiliation.entityType === 'host_organization';

  if (!shouldMatch) {
    return {
      ...affiliation,
      normalizedName,
      slug,
      identityMatchStatus: affiliation.identityMatchStatus ?? 'unmatched',
      identifiers: affiliation.identifiers,
      aliases: affiliation.aliases ?? [{ name: normalizedName, kind: 'normalized' }],
    };
  }

  if (affiliation.identifiers && affiliation.identifiers.length > 0) {
    return {
      ...affiliation,
      normalizedName,
      slug,
      identityMatchStatus: affiliation.identityMatchStatus ?? 'matched',
      aliases: affiliation.aliases ?? [{ name: normalizedName, kind: 'normalized' }],
    };
  }

  const match = matchSchoolIdentity(affiliation.name, options);
  const internalSlugId: CanonicalIdentifier = {
    idNamespace: 'internal-slug',
    canonicalId: slug,
    confidence: 'high',
    source: 'canonical-normalize',
  };

  return {
    ...affiliation,
    normalizedName,
    slug,
    identityMatchStatus: match.status,
    identifiers:
      match.status === 'matched' ? [...match.identifiers, internalSlugId] : [internalSlugId],
    aliases: match.aliases.length > 0 ? match.aliases : [{ name: normalizedName, kind: 'normalized' }],
  };
}

export function affiliationsWithCanonicalIdentity(
  season: Pick<TeamSeason, 'season' | 'organization' | 'affiliations' | 'state' | 'city' | 'location' | 'registeredLocation'>,
  options: CatalogLookupOptions = {},
): TeamAffiliation[] {
  const stateCode =
    options.stateCode ??
    season.registeredLocation?.stateCode ??
    normalizeStateCode(season.state) ??
    parseLocationString(season.location).stateCode;

  return affiliationsForSeason(season).map((row) =>
    enrichAffiliationIdentity(row, { ...options, stateCode }),
  );
}

/**
 * Derive-on-read: fill `registeredLocation` and affiliation identity fields.
 * Does not mutate the input season.
 */
export function enrichSeasonCanonicalIdentity(
  season: TeamSeason,
  options: CatalogLookupOptions = {},
): TeamSeason {
  const registeredLocation = buildRegisteredLocation(season);
  const stateCode = options.stateCode ?? registeredLocation.stateCode;
  const affiliations = affiliationsWithCanonicalIdentity(season, { ...options, stateCode });

  return {
    ...season,
    registeredLocation,
    affiliations,
  };
}

/** Persist-oriented enrich for opt-in `--enrich-canonical-ids`. */
export function enrichTeamCanonicalIdentity(team: Team, options: CatalogLookupOptions = {}): Team {
  const seasons: Team['seasons'] = { ...team.seasons };
  for (const [key, season] of Object.entries(seasons)) {
    if (!season) continue;
    const seasonKey = Number(key) as TeamSeason['season'];
    seasons[seasonKey] = enrichSeasonCanonicalIdentity(season, options);
  }
  return { ...team, seasons };
}

export function enrichGeneratedDataCanonicalIdentity<T extends { teams: Team[] }>(
  data: T,
  options: CatalogLookupOptions = {},
): T {
  return {
    ...data,
    teams: data.teams.map((team) => enrichTeamCanonicalIdentity(team, options)),
  };
}

/**
 * True when postal/registered state differs from event-region membership signals.
 * Used for cross-state Nevada league participation analysis.
 */
export function isCrossStateRegionParticipant(
  season: Pick<TeamSeason, 'state' | 'region' | 'registeredLocation'>,
  regionCode: string | null | undefined,
): boolean {
  const postal =
    season.registeredLocation?.stateCode ?? normalizeStateCode(season.state) ?? null;
  if (!postal) {
    return false;
  }

  const regionText = `${season.region ?? ''} ${regionCode ?? ''}`.toLowerCase();
  const looksNevada =
    regionText.includes('nevada') ||
    regionText.includes('usnv') ||
    /\bnv\b/.test(regionText);

  if (looksNevada) {
    return postal !== 'NV';
  }

  return false;
}
