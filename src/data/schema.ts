export {
  CURRENT_SEASON,
  SUPPORTED_SEASONS,
  TARGET_SEASONS,
  availableSeasons,
  currentSeason,
  isCurrentSeason,
  isSupportedSeason,
  lastAvailableSeason,
  seasonFilterOptions,
  type SeasonId,
} from './seasons';

import { SeasonId, availableSeasons, seasonFilterOptions } from './seasons';

export type RecordSummary = {
  wins: number;
  losses: number;
  ties: number;
  text: string;
};

export type TeamEvent = {
  code: string | null;
  name: string;
  dateRange: string | null;
  eventOrder: number | null;
  location: string | null;
  league: string | null;
  rank: string | null;
  totalPoints: number | null;
  matchCount: number;
  rankingScore: number | null;
  leagueSeasonRank: number | null;
  leagueSeasonRankTotal: number | null;
  qualificationUrl: string | null;
  playoffUrl: string | null;
  playoffRecord: string | null;
  allianceSelection: string | null;
  sourceUrl: string | null;
};

export type TeamAward = {
  name: string;
  awardType: string;
  eventName: string;
  eventCode: string | null;
  awardUrl: string | null;
  eventUrl: string | null;
};

export type LinkOwnershipConfidence = 'high' | 'medium' | 'low';
export type LinkConfirmation = 'unconfirmed' | 'confirmed' | 'rejected';
export type LinkLiveness = 'alive' | 'dead' | 'unknown';

/**
 * Public team/resource link discovered from On The Web or bounded website crawls.
 * Optional provenance fields are additive — older seeds without them still validate.
 */
export type TeamLink = {
  type: 'website' | 'social' | 'code' | 'video' | 'cad' | 'docs' | 'community' | 'link-hub' | 'other';
  label: string;
  url: string;
  source: string;
  ownershipConfidence?: LinkOwnershipConfidence;
  confirmationState?: LinkConfirmation;
  /** Short attribution note (e.g. same-host as declared website, On The Web URL). */
  evidence?: string | null;
  notes?: string | null;
  retrievedAt?: string | null;
  lastCheckedAt?: string | null;
  httpStatus?: number | null;
  liveness?: LinkLiveness;
};

/**
 * Verified public GitHub repository attached to a team (#22).
 * Ownership always requires evidence beyond the team number alone.
 * Optional / additive — older seeds without `codeRepositories` remain valid.
 */
export type CodeRepositoryEvidenceKind =
  | 'declared-link'
  | 'open-alliance'
  | 'gm0-gallery'
  | 'search-corroborated';

export type TeamCodeRepository = {
  url: string;
  /** GitHub org or user login that owns the public repo. */
  owner: string;
  name: string;
  fullName: string;
  /** Seasons mentioned in description/topics when known. */
  seasons?: number[] | null;
  /** Robot/controller platform hint when known (e.g. REV Control Hub). */
  robotControllerType?: string | null;
  languages?: string[] | null;
  /** Typically GitHub `pushed_at`. */
  lastActivity?: string | null;
  description?: string | null;
  evidence: string;
  evidenceKind: CodeRepositoryEvidenceKind;
  ownershipConfidence: LinkOwnershipConfidence;
  confirmationState?: LinkConfirmation;
  source: string;
  retrievedAt?: string | null;
};

/**
 * Role for a parsed organization/sponsor segment.
 * Auto-backfill typically fills school, sponsor, community_organization,
 * team_affiliation, and host_organization. Other roles are schema-supported
 * for future manual/enrichment use (see docs/organization-affiliations.md).
 */
export type OrganizationEntityType =
  | 'school'
  | 'school_district'
  | 'host_organization'
  | 'program_operator'
  | 'community_organization'
  | 'sponsor'
  | 'funder'
  | 'fiscal_sponsor'
  | 'team_affiliation';

export type AffiliationConfidence = 'high' | 'medium' | 'low';
export type AffiliationConfirmation = 'unconfirmed' | 'confirmed' | 'rejected';

/**
 * Namespace for optional canonical / external identifiers (#16).
 * Prefer free public schemes; never invent paid-API or guessed IDs.
 */
export type CanonicalIdNamespace =
  | 'internal-slug'
  | 'iso-3166-1'
  | 'iso-3166-2'
  | 'nces-sch'
  | 'nces-lea'
  | 'nces-pss'
  | 'osm'
  | 'other';

/** External or internal identity token with optional match provenance. */
export type CanonicalIdentifier = {
  idNamespace: CanonicalIdNamespace | string;
  canonicalId: string;
  confidence?: AffiliationConfidence;
  /** Public evidence URL or short attribution note. */
  evidence?: string | null;
  source?: string | null;
};

export type NameAliasKind = 'alias' | 'historical' | 'normalized';

/** Alternate or historical organization/school display name. */
export type NameAlias = {
  name: string;
  kind: NameAliasKind;
  validFrom?: string | null;
  validTo?: string | null;
};

export type IdentityMatchStatus = 'unmatched' | 'matched' | 'ambiguous' | 'quarantined';

/**
 * Registered / postal location — distinct from event-region membership
 * (`GeneratedData.regionCode`, `TeamSeason.region` / `league`).
 */
export type NormalizedLocation = {
  normalizedName?: string | null;
  city?: string | null;
  /** USPS / postal state abbreviation when known (e.g. NV). */
  stateCode?: string | null;
  /** ISO 3166-1 alpha-2 when confidently parsed (e.g. US). */
  countryCode?: string | null;
  /** ISO 3166-2 when confidently parsed (e.g. US-NV). */
  subdivisionCode?: string | null;
  rawLocation?: string | null;
  /** Geo stubs only when confidently available — never invented offline. */
  geo?: {
    lat?: number | null;
    lon?: number | null;
    osmId?: string | null;
    precision?: 'city' | 'state' | 'country' | 'point' | null;
  } | null;
  identifiers?: CanonicalIdentifier[];
};

/** Season-scoped org/sponsor relationship derived from public sponsor text. */
export type TeamAffiliation = {
  entityType: OrganizationEntityType;
  name: string;
  season: SeasonId;
  source: string;
  retrievedAt: string | null;
  confidence: AffiliationConfidence;
  confirmationState: AffiliationConfirmation;
  /** Full unmodified organization source string for this season. */
  sourceText: string;
  /** Additive identity fields (#16); omitted on older seeds. */
  normalizedName?: string | null;
  /** Stable internal slug derived from the display name. */
  slug?: string | null;
  /** External IDs only when confidently matched — never invented. */
  identifiers?: CanonicalIdentifier[];
  aliases?: NameAlias[];
  identityMatchStatus?: IdentityMatchStatus;
};

/**
 * Field-level provenance for season facts (additive; see docs/field-evidence.md).
 * Parallel to TeamAffiliation provenance — affiliations are not replaced by this model.
 */
export type TeamFactField =
  | 'name'
  | 'location'
  | 'organization'
  | 'website'
  | 'record'
  | 'qualificationRecord'
  | 'playoffRecord'
  | 'rookieYear'
  | 'league'
  | 'region'
  | 'robot'
  | 'teamType'
  | 'active';

export type FactKind = 'observed' | 'derived';
export type ObservationStatus = 'current' | 'conflicting' | 'superseded';
export type EvidenceConfidence = AffiliationConfidence;
export type EvidenceConfirmation = AffiliationConfirmation;

export type FieldEvidence = {
  /** Stable within a season for supersede / conflict links. */
  id: string;
  field: TeamFactField;
  /** Normalized display/compare string for the observed or derived value. */
  value: string;
  kind: FactKind;
  /** e.g. ftc-events-team-page, first-search, organization-parse, derived */
  sourceType: string;
  sourceUrl: string | null;
  retrievedAt: string | null;
  observedSeason: SeasonId;
  /** e.g. html-field, html-title, search-index, heuristic, organization-split, offline-synthesize */
  extractionMethod: string;
  confidence: EvidenceConfidence;
  confirmationState: EvidenceConfirmation;
  status: ObservationStatus;
  rawValue: string | null;
  supersedesId: string | null;
};

/** Live refresh provenance for a team-season (runtime only; not in seed JSON). */
export type LiveSourceMeta = {
  ok: boolean;
  state: string;
  userMessage?: string;
  diagnostics?: string;
};

export type TeamSeason = {
  season: SeasonId;
  active: boolean;
  name: string;
  location: string;
  city: string | null;
  state: string | null;
  country: string | null;
  region: string | null;
  league: string | null;
  rookieYear: number | null;
  /** Raw public sponsor/organization line; never discarded when affiliations exist. */
  organization: string | null;
  /**
   * Additive structured split of `organization`. Omitted on older seeds;
   * derive with `affiliationsForSeason` when missing.
   */
  affiliations?: TeamAffiliation[];
  /**
   * Additive registered/postal location (#16). Distinct from `region` / envelope
   * `regionCode` (event-region membership). Omitted on older seeds; derive with
   * `enrichSeasonCanonicalIdentity` when missing.
   */
  registeredLocation?: NormalizedLocation | null;
  teamType: 'school' | 'non-school' | 'unknown';
  website: string | null;
  robot: string | null;
  sourceUrl: string;
  summary: string | null;
  record: RecordSummary | null;
  qualificationRecord: RecordSummary | null;
  playoffRecord: RecordSummary | null;
  events: TeamEvent[];
  awards: TeamAward[];
  notes: string[];
  /**
   * Additive per-field evidence for core season facts. Omitted on older/checked-in
   * seeds; derive display rows with `evidenceForSeason` when missing. Live refresh
   * and `pull:data` write evidence going forward.
   */
  evidence?: FieldEvidence[];
  /** Present on live refresh results only; omitted from checked-in seed JSON. */
  liveSource?: LiveSourceMeta;
};

export type Team = {
  number: number;
  latestName: string;
  latestLocation: string;
  latestCity: string | null;
  latestState: string | null;
  latestCountry: string | null;
  latestRookieYear: number | null;
  latestOrganization: string | null;
  latestWebsite: string | null;
  latestTeamType: 'school' | 'non-school' | 'unknown';
  latestLeague: string | null;
  latestRegion: string | null;
  links: TeamLink[];
  /**
   * Optional verified public GitHub repos (#22). Omitted on older seeds;
   * populated when `--enrich-github` verifies declared / corroborated URLs.
   */
  codeRepositories?: TeamCodeRepository[];
  seasons: Partial<Record<SeasonId, TeamSeason>>;
};

export type RegionEvent = {
  season: SeasonId;
  code: string;
  name: string;
  league: string | null;
  location: string | null;
  date: string | null;
  sourceUrl: string;
};

export type DataSource = {
  label: string;
  url: string;
  note: string;
};

/** Per-source health stamp written by `pull:data` / scheduled refresh (#3). */
export type SourceCheck = {
  label: string;
  url: string;
  checkedAt: string;
  ok: boolean;
  detail?: string;
};

/**
 * Generated snapshot envelope. Runtime validation lives in `generatedSeedSchema.ts`
 * (`GENERATED_DATA_SCHEMA_VERSION` = 1). The checked-in Nevada JSON omits
 * `schemaVersion` and is treated as version 1. `sources` is document-level
 * provenance; optional season `evidence` holds per-field observations (issue #5).
 * Cross-refresh history lives in the append-only observations side store (#29),
 * not in the mega seed. Optional `sourceChecks` records generation-time upstream
 * probe results (#3).
 */
export type GeneratedData = {
  generatedAt: string;
  liveRefreshedAt?: string;
  targetSeasons: SeasonId[];
  regionCode: string;
  regionLabel?: string;
  /** Present on future snapshots; omitted seed JSON is version 1. */
  schemaVersion?: number;
  teams: Team[];
  regionEvents: RegionEvent[];
  sources: DataSource[];
  limitations: string[];
  /** Optional; omitted on older checked-in seeds. */
  sourceChecks?: SourceCheck[];
};

/**
 * Append-only observation log for public team field changes across refreshes (#29).
 * Served as `/data/nv-ftc-team-observations.generated.json` (not embedded in seed).
 */
export type TeamObservationRecord = FieldEvidence & {
  teamNumber: number;
};

export type TeamObservationsData = {
  generatedAt: string;
  /** Present on future snapshots; omitted file is version 1. */
  schemaVersion?: number;
  regionCode: string;
  observations: TeamObservationRecord[];
};

/**
 * Seasons shown in the directory filter: available from data plus current.
 * Unsupported years are hidden. Prefer seasonFilterOptions / availableSeasons for new code.
 */
export function seasonOptions(data?: Pick<GeneratedData, 'targetSeasons' | 'teams'>): SeasonId[] {
  return seasonFilterOptions(data);
}

export function seasonHasIngestedData(
  data: Pick<GeneratedData, 'targetSeasons' | 'teams'>,
  season: SeasonId,
): boolean {
  return availableSeasons(data).includes(season);
}
