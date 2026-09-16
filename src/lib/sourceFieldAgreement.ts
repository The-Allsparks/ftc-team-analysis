import type { TeamScoutData } from '../data/ftcScout';
import { ftcScoutTeamUrl } from '../data/ftcScout';
import type { FieldEvidence, SeasonId, TeamFactField, TeamSeason } from '../data/schema';
import { enrichSeasonCanonicalIdentity } from './canonicalIdentity';
import { createEvidence, evidenceForSeasonField, synthesizeSeasonEvidence } from './fieldEvidence';
import { evidenceFromFirstApiTeam, type FirstApiTeam } from './firstEventsApi';
import { classifyTeamType } from './ftcParsers';
import {
  catalogSourceId,
  FIELD_AGREEMENT_SOURCES,
  sourceCatalogEntry,
  type SourceCatalogEntry,
} from './sourceCatalog';
import { teamTypeLabel } from './teamDirectory';

export { catalogSourceId, FIELD_AGREEMENT_SOURCES, sourceCatalogEntry, type SourceCatalogEntry };

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
  firstApiTeam?: FirstApiTeam | null;
  firstApiSeason?: SeasonId | null;
  firstApiRetrievedAt?: string | null;
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

function firstApiTeamEvidence(season: TeamSeason, extras: FieldAgreementExtras): FieldEvidence[] {
  if (!extras.firstApiTeam) {
    return [];
  }
  if (extras.firstApiSeason != null && extras.firstApiSeason !== season.season) {
    return [];
  }
  return evidenceFromFirstApiTeam(
    extras.firstApiTeam,
    season.season,
    extras.firstApiRetrievedAt ?? null,
    { teamNumber: extras.teamNumber },
  );
}

/**
 * Combine stored/synthesized evidence with read-time votes from NCES, live FTCScout,
 * and live FIRST API team listings.
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
    ...firstApiTeamEvidence(season, extras ?? {}).filter(
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
