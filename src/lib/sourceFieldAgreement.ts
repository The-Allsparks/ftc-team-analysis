import type { TeamScoutData } from '../data/ftcScout';
import { ftcScoutTeamUrl } from '../data/ftcScout';
import type { PortfolioLabEntry } from '../data/portfolioLab';
import { portfolioLabSearchUrl, portfolioMatchesSeason } from '../data/portfolioLab';
import type { FieldEvidence, Team, TeamFactField, TeamSeason } from '../data/schema';
import { CURRENT_SEASON } from '../data/seasons';
import { enrichSeasonCanonicalIdentity } from './canonicalIdentity';
import { createEvidence, evidenceForSeasonField, synthesizeSeasonEvidence } from './fieldEvidence';
import { classifyTeamType } from './ftcParsers';
import {
  evidenceFromOpenAllianceListing,
  isOpenAllianceLinkSource,
  type OpenAllianceFtcTeam,
} from './openAlliance';
import { teamTypeLabel } from './teamDirectory';

export type SourceCatalogEntry = {
  id: string;
  label: string;
  /** Public origin used for Google s2 favicons. */
  faviconOrigin: string;
  homepage: string;
};

export const FIELD_AGREEMENT_SOURCES: readonly SourceCatalogEntry[] = [
  {
    id: 'ftc-events',
    label: 'FTC Events',
    faviconOrigin: 'https://ftc-events.firstinspires.org',
    homepage: 'https://ftc-events.firstinspires.org/',
  },
  {
    id: 'first-api',
    label: 'FIRST API',
    faviconOrigin: 'https://ftc-api.firstinspires.org',
    homepage: 'https://ftc-events.firstinspires.org/services/API',
  },
  {
    id: 'ftcscout',
    label: 'FTCScout',
    faviconOrigin: 'https://ftcscout.org',
    homepage: 'https://ftcscout.org/',
  },
  {
    id: 'portfolio-lab',
    label: 'Portfolio Lab',
    faviconOrigin: 'https://www.ftcportfoliolab.org',
    homepage: 'https://www.ftcportfoliolab.org/',
  },
  {
    id: 'open-alliance',
    label: 'Open Alliance',
    faviconOrigin: 'https://www.theopenalliance.org',
    homepage: 'https://www.theopenalliance.org/',
  },
  {
    id: 'gm0',
    label: 'Game Manual 0',
    faviconOrigin: 'https://gm0.org',
    homepage: 'https://gm0.org/',
  },
  {
    id: 'nces',
    label: 'NCES',
    faviconOrigin: 'https://nces.ed.gov',
    homepage: 'https://nces.ed.gov/ccd/',
  },
];

const SOURCE_ALIASES: Record<string, string> = {
  'ftc-events-team-page': 'ftc-events',
  'ftc events': 'ftc-events',
  'first-search': 'ftc-events',
  'first api': 'first-api',
  'ftc events api': 'first-api',
  'ftc events api (authenticated)': 'first-api',
  ftcscout: 'ftcscout',
  'portfolio lab': 'portfolio-lab',
  'open alliance': 'open-alliance',
  'open alliance (team-declared)': 'open-alliance',
  gm0: 'gm0',
  'game manual 0': 'gm0',
  'game manual 0 (gallery)': 'gm0',
  derived: 'ftc-events',
  'organization-parse': 'ftc-events',
  'organization-backfill': 'ftc-events',
  'offline-synthesize': 'ftc-events',
  'nces-catalog': 'nces',
  'nces-ccd-catalog': 'nces',
  'nces-pss-catalog': 'nces',
};

export type SourceVote = {
  sourceId: string;
  label: string;
  faviconOrigin: string | null;
  homepage: string | null;
  value: string;
  displayValue: string;
  retrievedAt: string | null;
  sourceUrl: string | null;
  agreesWithMajority: boolean;
};

export type FieldAgreement = {
  field: TeamFactField;
  majorityValue: string;
  majorityDisplay: string;
  majorityCount: number;
  totalVotes: number;
  agreeing: SourceVote[];
  dissenting: SourceVote[];
};

function normalizeSourceKey(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function catalogSourceId(sourceType: string): string {
  const key = normalizeSourceKey(sourceType);
  return SOURCE_ALIASES[key] ?? key.replace(/[^a-z0-9]+/g, '-');
}

export function sourceCatalogEntry(sourceType: string): SourceCatalogEntry | null {
  const id = catalogSourceId(sourceType);
  return FIELD_AGREEMENT_SOURCES.find((entry) => entry.id === id) ?? null;
}

export function googleFaviconUrl(origin: string, size = 32): string {
  let host = origin;
  try {
    host = new URL(origin).hostname;
  } catch {
    host = origin.replace(/^https?:\/\//, '').split('/')[0] ?? origin;
  }
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`;
}

export function normalizeFieldCompareValue(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function formatFieldDisplayValue(field: TeamFactField, value: string): string {
  if (field === 'teamType') {
    if (value === 'school' || value === 'non-school' || value === 'unknown') {
      return teamTypeLabel(value);
    }
  }
  if (field === 'active') {
    if (value === 'true') return 'Active';
    if (value === 'false') return 'Not listed / inactive';
  }
  return value;
}

export function formatSeenAt(retrievedAt: string | null): string {
  if (!retrievedAt) {
    return 'collection time unknown';
  }
  const date = new Date(retrievedAt);
  if (Number.isNaN(date.getTime())) {
    return retrievedAt;
  }
  return date.toISOString().slice(0, 10);
}

export function sourceVoteTitle(vote: SourceVote): string {
  const seen = formatSeenAt(vote.retrievedAt);
  return `${vote.label}: ${vote.displayValue} · last seen ${seen}`;
}

export type FieldAgreementExtras = {
  teamNumber?: number;
  scout?: TeamScoutData | null;
  team?: Team | null;
  portfolios?: PortfolioLabEntry[] | null;
  portfolioFetchedAt?: string | null;
  openAlliance?: OpenAllianceFtcTeam | null;
  openAllianceRetrievedAt?: string | null;
};

function hasCatalogSource(rows: FieldEvidence[], sourceId: string): boolean {
  return rows.some(
    (row) => row.status === 'current' && catalogSourceId(row.sourceType) === sourceId,
  );
}

function formatScoutLocation(profile: NonNullable<TeamScoutData['profile']>): string | null {
  const parts = [profile.city, profile.state, profile.country].filter(
    (part): part is string => Boolean(part && part.trim()),
  );
  return parts.length > 0 ? parts.join(', ') : null;
}

function ncesTeamTypeEvidence(season: TeamSeason): FieldEvidence | null {
  const enriched = enrichSeasonCanonicalIdentity(season);
  for (const row of enriched.affiliations ?? []) {
    if (row.identityMatchStatus !== 'matched') {
      continue;
    }
    const nces = (row.identifiers ?? []).find(
      (id) => id.idNamespace === 'nces-sch' || id.idNamespace === 'nces-pss' || id.idNamespace === 'nces-lea',
    );
    if (!nces) {
      continue;
    }
    return createEvidence({
      field: 'teamType',
      value: 'school',
      kind: 'derived',
      sourceType: 'nces-catalog',
      sourceUrl: nces.evidence ?? 'https://nces.ed.gov/ccd/',
      retrievedAt: row.retrievedAt,
      observedSeason: season.season,
      extractionMethod: 'nces-catalog-match',
      confidence: nces.confidence ?? 'high',
      rawValue: row.name,
    });
  }
  return null;
}

function scoutProfileEvidence(season: TeamSeason, extras: FieldAgreementExtras): FieldEvidence[] {
  const profile = extras.scout?.profile;
  if (!profile) {
    return [];
  }
  // Team profile is current identity from FTCScout; only vote on the season the scout fetch targeted.
  if (extras.scout && extras.scout.season !== season.season) {
    return [];
  }

  const retrievedAt = profile.updatedAt ?? extras.scout?.fetchedAt ?? null;
  const sourceUrl =
    extras.teamNumber != null ? ftcScoutTeamUrl(extras.teamNumber, season.season) : 'https://ftcscout.org/';
  const rows: FieldEvidence[] = [];

  const add = (field: TeamFactField, value: string | null | undefined, extractionMethod: string) => {
    if (value == null) {
      return;
    }
    const trimmed = String(value).trim();
    if (!trimmed) {
      return;
    }
    rows.push(
      createEvidence({
        field,
        value: trimmed,
        kind: field === 'teamType' ? 'derived' : 'observed',
        sourceType: 'FTCScout',
        sourceUrl,
        retrievedAt,
        observedSeason: season.season,
        extractionMethod,
        confidence: 'medium',
        rawValue: trimmed,
      }),
    );
  };

  add('name', profile.name, 'scout-team-profile');
  add('organization', profile.schoolName, 'scout-school-name');
  add('website', profile.website, 'scout-team-profile');
  add('location', formatScoutLocation(profile), 'scout-team-profile');
  add('rookieYear', profile.rookieYear != null ? String(profile.rookieYear) : null, 'scout-team-profile');
  if (profile.schoolName) {
    add('teamType', classifyTeamType('', profile.schoolName), 'scout-school-name');
  }

  return rows;
}

function openAllianceEvidence(season: TeamSeason, extras: FieldAgreementExtras): FieldEvidence[] {
  if (season.season !== CURRENT_SEASON) {
    return [];
  }
  if (extras.openAlliance && extras.teamNumber != null) {
    return evidenceFromOpenAllianceListing(
      extras.openAlliance,
      season.season,
      extras.openAllianceRetrievedAt ?? null,
      extras.teamNumber,
    );
  }

  const website = (extras.team?.links ?? []).find(
    (link) => isOpenAllianceLinkSource(link.source) && (link.type === 'website' || /website/i.test(link.label)),
  );
  if (!website || extras.teamNumber == null) {
    return [];
  }
  return evidenceFromOpenAllianceListing(
    { TeamNumber: extras.teamNumber, TeamWebsite: website.url },
    season.season,
    website.retrievedAt ?? website.lastCheckedAt ?? null,
    extras.teamNumber,
  );
}

function portfolioLabEvidence(season: TeamSeason, extras: FieldAgreementExtras): FieldEvidence[] {
  const portfolios = extras.portfolios ?? [];
  if (portfolios.length === 0 || extras.teamNumber == null) {
    return [];
  }

  const matched =
    portfolios.find((entry) => portfolioMatchesSeason(entry, season.season)) ??
    (season.season === CURRENT_SEASON ? portfolios[0] : undefined);
  if (!matched) {
    return [];
  }

  const retrievedAt = extras.portfolioFetchedAt ?? null;
  const sourceUrl = portfolioLabSearchUrl(extras.teamNumber);
  const rows: FieldEvidence[] = [];
  const add = (field: TeamFactField, value: string | null | undefined, extractionMethod: string) => {
    if (value == null) {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    rows.push(
      createEvidence({
        field,
        value: trimmed,
        kind: 'observed',
        sourceType: 'portfolio-lab',
        sourceUrl,
        retrievedAt,
        observedSeason: season.season,
        extractionMethod,
        confidence: 'medium',
        rawValue: trimmed,
      }),
    );
  };

  add('name', matched.teamName, 'portfolio-lab-team-name');
  if (matched.city) {
    add('location', matched.city, 'portfolio-lab-city');
  }
  return rows;
}

/**
 * Combine stored/synthesized evidence with read-time votes from NCES, live FTCScout,
 * Open Alliance listings, and Portfolio Lab catalogs.
 */
export function collectFieldEvidence(
  season: TeamSeason,
  field: TeamFactField,
  extras?: FieldAgreementExtras,
): FieldEvidence[] {
  const existing = evidenceForSeasonField(season, field);
  const extra: FieldEvidence[] = [];

  if (!hasCatalogSource(existing, 'ftc-events')) {
    extra.push(...synthesizeSeasonEvidence(season).filter((row) => row.field === field));
  }

  if (field === 'teamType' && !hasCatalogSource([...existing, ...extra], 'nces')) {
    const nces = ncesTeamTypeEvidence(season);
    if (nces) {
      extra.push(nces);
    }
  }

  extra.push(
    ...scoutProfileEvidence(season, extras ?? {}).filter(
      (row) => row.field === field && !hasCatalogSource(existing, catalogSourceId(row.sourceType)),
    ),
  );

  extra.push(
    ...openAllianceEvidence(season, extras ?? {}).filter(
      (row) =>
        row.field === field && !hasCatalogSource([...existing, ...extra], catalogSourceId(row.sourceType)),
    ),
  );

  extra.push(
    ...portfolioLabEvidence(season, extras ?? {}).filter(
      (row) =>
        row.field === field && !hasCatalogSource([...existing, ...extra], catalogSourceId(row.sourceType)),
    ),
  );

  return [...existing, ...extra].filter((row) => row.status !== 'superseded');
}

/**
 * Majority value from current (non-superseded) evidence rows, one vote per source.
 * Ties keep the season's current displayed value when it is among the tied set.
 */
export function fieldAgreement(
  season: TeamSeason,
  field: TeamFactField,
  displayedValue?: string | null,
  extras?: FieldAgreementExtras,
): FieldAgreement | null {
  const rows = collectFieldEvidence(season, field, extras);
  if (rows.length === 0) {
    return null;
  }

  const latestBySource = new Map<string, FieldEvidence>();
  for (const row of rows) {
    const sourceId = catalogSourceId(row.sourceType);
    const existing = latestBySource.get(sourceId);
    if (!existing) {
      latestBySource.set(sourceId, row);
      continue;
    }
    const existingCurrent = existing.status === 'current';
    const nextCurrent = row.status === 'current';
    if (nextCurrent && !existingCurrent) {
      latestBySource.set(sourceId, row);
      continue;
    }
    if (!nextCurrent && existingCurrent) {
      continue;
    }
    const existingTs = existing.retrievedAt ? Date.parse(existing.retrievedAt) : 0;
    const nextTs = row.retrievedAt ? Date.parse(row.retrievedAt) : 0;
    if (nextTs >= existingTs) {
      latestBySource.set(sourceId, row);
    }
  }

  const counts = new Map<string, number>();
  for (const row of latestBySource.values()) {
    const key = normalizeFieldCompareValue(row.value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const maxCount = Math.max(...counts.values());
  const tied = [...counts.entries()].filter(([, count]) => count === maxCount).map(([key]) => key);
  const displayedKey = displayedValue ? normalizeFieldCompareValue(displayedValue) : null;
  const majorityKey =
    (displayedKey && tied.includes(displayedKey) ? displayedKey : null) ?? tied.sort()[0]!;

  const votes: SourceVote[] = [...latestBySource.entries()].map(([sourceId, row]) => {
    const catalog = sourceCatalogEntry(row.sourceType);
    const agrees = normalizeFieldCompareValue(row.value) === majorityKey;
    return {
      sourceId,
      label: catalog?.label ?? row.sourceType,
      faviconOrigin: catalog?.faviconOrigin ?? null,
      homepage: catalog?.homepage ?? row.sourceUrl,
      value: row.value,
      displayValue: formatFieldDisplayValue(field, row.value),
      retrievedAt: row.retrievedAt,
      sourceUrl: row.sourceUrl,
      agreesWithMajority: agrees,
    };
  });

  votes.sort((a, b) => a.label.localeCompare(b.label));

  const majorityRow = [...latestBySource.values()].find(
    (row) => normalizeFieldCompareValue(row.value) === majorityKey,
  );

  return {
    field,
    majorityValue: majorityRow?.value ?? displayedValue ?? '',
    majorityDisplay: formatFieldDisplayValue(field, majorityRow?.value ?? displayedValue ?? ''),
    majorityCount: maxCount,
    totalVotes: votes.length,
    agreeing: votes.filter((vote) => vote.agreesWithMajority),
    dissenting: votes.filter((vote) => !vote.agreesWithMajority),
  };
}
