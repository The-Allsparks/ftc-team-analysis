export const TARGET_SEASONS = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019] as const;

export type SeasonId = (typeof TARGET_SEASONS)[number];

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

export type TeamLink = {
  type: 'website' | 'social' | 'code' | 'video' | 'cad' | 'docs' | 'community' | 'link-hub' | 'other';
  label: string;
  url: string;
  source: string;
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
  | 'teamType';

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
   * Additive per-field evidence for core season facts. Omitted on older seeds;
   * synthesize with `synthesizeSeasonEvidence` / parsers when missing.
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

/**
 * Generated snapshot envelope. Runtime validation lives in `generatedSeedSchema.ts`
 * (`GENERATED_DATA_SCHEMA_VERSION` = 1). The checked-in Nevada JSON omits
 * `schemaVersion` and is treated as version 1. `sources` is document-level
 * provenance; optional season `evidence` holds per-field observations (issue #5).
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
};

export function seasonOptions(data?: Pick<GeneratedData, 'targetSeasons' | 'teams'>): SeasonId[] {
  const fromTeams =
    data?.teams.flatMap((team) =>
      Object.keys(team.seasons ?? {}).map((season) => Number(season) as SeasonId),
    ) ?? [];
  const fromTarget = data?.targetSeasons ?? [];

  return [...new Set([...TARGET_SEASONS, ...fromTarget, ...fromTeams])]
    .filter((season): season is SeasonId => (TARGET_SEASONS as readonly number[]).includes(season))
    .sort((a, b) => b - a);
}
