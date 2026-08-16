import { GeneratedData, SeasonId, SourceCheck, Team } from '../data/schema';
import { evidenceForSeason } from './fieldEvidence';
import { affiliationsForSeason } from './organizationAffiliations';
import { isSourceFailureState, SourceState } from './sourceResult';
import { buildTeamLineageMap, getTeamLineage, visibleRelatedLinks } from '../teamLineage';

/** Seed older than this is flagged stale for maintainers (#30). */
export const STALE_SEED_MAX_AGE_MS = 8 * 24 * 60 * 60 * 1000;

/** Highlight YoY season team-count drops at or above this ratio when prior season ≥ min teams. */
export const SEASON_COUNT_DROP_HIGHLIGHT_RATIO = 0.2;
export const SEASON_COUNT_DROP_MIN_PREVIOUS = 10;

export const LAST_SEEN_TEAM_COUNT_STORAGE_KEY = 'ftc-team-analysis:last-seen-team-count';
export const LAST_SEEN_TEAM_COUNT_AT_STORAGE_KEY = 'ftc-team-analysis:last-seen-team-count-at';

export const DATA_HEALTH_HASH = '#health';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export type SessionSourceStatus = 'idle' | 'loading' | 'ready' | 'error' | 'refreshing';

/** Session-only live enrichment snapshot — do not probe on dashboard open. */
export type LiveSourceSnapshot = {
  id: string;
  label: string;
  sessionStatus: SessionSourceStatus;
  sourceState: SourceState | null;
  message: string | null;
  diagnostics: string | null;
};

export type SeasonCoverageRow = {
  season: SeasonId;
  teamCount: number;
  missingWebsite: number;
  missingOrganization: number;
  missingLocation: number;
};

export type SeasonCountDelta = {
  fromSeason: SeasonId;
  toSeason: SeasonId;
  fromCount: number;
  toCount: number;
  delta: number;
  dropRatio: number | null;
  highlighted: boolean;
};

export type AffiliationConfidenceCounts = {
  high: number;
  medium: number;
  low: number;
};

export type EvidenceHealthCounts = {
  seasonRowsWithEvidence: number;
  conflictingObservations: number;
  unconfirmedObservations: number;
};

export type LastSeenTeamCountDelta = {
  previousCount: number;
  currentCount: number;
  delta: number;
  highlighted: boolean;
  seenAt: string | null;
};

export type SourceHealthReport = {
  generatedAt: string;
  regionCode: string;
  regionLabel: string | null;
  teamCount: number;
  regionEventCount: number;
  seasonRowCount: number;
  seedAgeMs: number;
  seedStale: boolean;
  sourceChecks: SourceCheck[];
  sourceCheckFailures: SourceCheck[];
  coverageBySeason: SeasonCoverageRow[];
  missingWebsiteTotal: number;
  missingOrganizationTotal: number;
  missingLocationTotal: number;
  affiliationConfidence: AffiliationConfidenceCounts;
  evidence: EvidenceHealthCounts;
  unverifiedRelationshipCount: number;
  seasonCountDeltas: SeasonCountDelta[];
  lastSeenTeamCountDelta: LastSeenTeamCountDelta | null;
  liveSources: LiveSourceSnapshot[];
  liveFailureCount: number;
};

export type BuildSourceHealthReportOptions = {
  now?: Date | string | number;
  liveSources?: LiveSourceSnapshot[];
  lastSeenTeamCount?: number | null;
  lastSeenAt?: string | null;
  /** When true, |last-seen Δ| ≥ 10% of previous (min 10) is highlighted. */
  highlightLastSeenDropRatio?: number;
};

function asDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

export function isDataHealthHash(hash: string): boolean {
  return hash === DATA_HEALTH_HASH || hash === '#/health';
}

export function readLastSeenTeamCount(storage: StorageLike | null | undefined): {
  count: number | null;
  seenAt: string | null;
} {
  if (!storage) {
    return { count: null, seenAt: null };
  }

  const raw = storage.getItem(LAST_SEEN_TEAM_COUNT_STORAGE_KEY);
  const seenAt = storage.getItem(LAST_SEEN_TEAM_COUNT_AT_STORAGE_KEY);
  if (raw == null || raw === '') {
    return { count: null, seenAt };
  }

  const count = Number(raw);
  if (!Number.isFinite(count) || count < 0) {
    return { count: null, seenAt };
  }

  return { count: Math.trunc(count), seenAt };
}

export function writeLastSeenTeamCount(
  teamCount: number,
  storage: StorageLike | null | undefined,
  now: Date | string | number = Date.now(),
): void {
  if (!storage) {
    return;
  }

  storage.setItem(LAST_SEEN_TEAM_COUNT_STORAGE_KEY, String(Math.trunc(teamCount)));
  storage.setItem(LAST_SEEN_TEAM_COUNT_AT_STORAGE_KEY, asDate(now).toISOString());
}

function seasonTeamCounts(teams: Team[]): Map<SeasonId, number> {
  const counts = new Map<SeasonId, number>();

  for (const team of teams) {
    for (const seasonKey of Object.keys(team.seasons ?? {})) {
      const season = Number(seasonKey) as SeasonId;
      counts.set(season, (counts.get(season) ?? 0) + 1);
    }
  }

  return counts;
}

export function buildSeasonCountDeltas(teams: Team[]): SeasonCountDelta[] {
  const counts = seasonTeamCounts(teams);
  const seasons = [...counts.keys()].sort((a, b) => a - b);
  const deltas: SeasonCountDelta[] = [];

  for (let index = 1; index < seasons.length; index += 1) {
    const fromSeason = seasons[index - 1]!;
    const toSeason = seasons[index]!;
    const fromCount = counts.get(fromSeason) ?? 0;
    const toCount = counts.get(toSeason) ?? 0;
    const delta = toCount - fromCount;
    const dropRatio = fromCount > 0 && delta < 0 ? Math.abs(delta) / fromCount : null;
    const highlighted =
      dropRatio != null &&
      fromCount >= SEASON_COUNT_DROP_MIN_PREVIOUS &&
      dropRatio >= SEASON_COUNT_DROP_HIGHLIGHT_RATIO;

    deltas.push({
      fromSeason,
      toSeason,
      fromCount,
      toCount,
      delta,
      dropRatio,
      highlighted,
    });
  }

  return deltas;
}

function countUnverifiedRelationships(teams: Team[]): number {
  const lineageMap = buildTeamLineageMap(teams);
  const pairs = new Set<string>();

  for (const team of teams) {
    const lineage = getTeamLineage(lineageMap, team.number);
    for (const link of visibleRelatedLinks(lineage)) {
      if (link.confirmationState !== 'unconfirmed') {
        continue;
      }
      const low = Math.min(team.number, link.teamNumber);
      const high = Math.max(team.number, link.teamNumber);
      pairs.add(`${low}:${high}`);
    }
  }

  return pairs.size;
}

function liveFailureCount(liveSources: LiveSourceSnapshot[]): number {
  return liveSources.filter((row) => {
    if (row.sessionStatus === 'error') {
      return true;
    }
    return row.sourceState != null && isSourceFailureState(row.sourceState);
  }).length;
}

function buildLastSeenDelta(
  currentCount: number,
  previousCount: number | null | undefined,
  seenAt: string | null | undefined,
  highlightRatio: number,
): LastSeenTeamCountDelta | null {
  if (previousCount == null || !Number.isFinite(previousCount)) {
    return null;
  }

  const delta = currentCount - previousCount;
  const dropRatio = previousCount > 0 && delta < 0 ? Math.abs(delta) / previousCount : null;
  const highlighted =
    dropRatio != null &&
    previousCount >= SEASON_COUNT_DROP_MIN_PREVIOUS &&
    dropRatio >= highlightRatio;

  return {
    previousCount,
    currentCount,
    delta,
    highlighted,
    seenAt: seenAt ?? null,
  };
}

/** Aggregate maintainer-facing source health and coverage metrics from the loaded seed + session hooks. */
export function buildSourceHealthReport(
  data: GeneratedData,
  options: BuildSourceHealthReportOptions = {},
): SourceHealthReport {
  const now = asDate(options.now ?? Date.now());
  const generatedAt = asDate(data.generatedAt);
  const seedAgeMs = Math.max(0, now.getTime() - generatedAt.getTime());
  const sourceChecks = data.sourceChecks ?? [];
  const sourceCheckFailures = sourceChecks.filter((check) => !check.ok);
  const liveSources = options.liveSources ?? [];

  const coverageBySeasonMap = new Map<SeasonId, SeasonCoverageRow>();
  const affiliationConfidence: AffiliationConfidenceCounts = { high: 0, medium: 0, low: 0 };
  const evidence: EvidenceHealthCounts = {
    seasonRowsWithEvidence: 0,
    conflictingObservations: 0,
    unconfirmedObservations: 0,
  };

  let seasonRowCount = 0;
  let missingWebsiteTotal = 0;
  let missingOrganizationTotal = 0;
  let missingLocationTotal = 0;

  for (const team of data.teams) {
    for (const season of Object.values(team.seasons ?? {})) {
      seasonRowCount += 1;
      const seasonId = season.season;
      const row =
        coverageBySeasonMap.get(seasonId) ??
        ({
          season: seasonId,
          teamCount: 0,
          missingWebsite: 0,
          missingOrganization: 0,
          missingLocation: 0,
        } satisfies SeasonCoverageRow);

      row.teamCount += 1;

      if (!season.website) {
        row.missingWebsite += 1;
        missingWebsiteTotal += 1;
      }
      if (!season.organization) {
        row.missingOrganization += 1;
        missingOrganizationTotal += 1;
      }
      if (!season.location) {
        row.missingLocation += 1;
        missingLocationTotal += 1;
      }

      coverageBySeasonMap.set(seasonId, row);

      for (const affiliation of affiliationsForSeason(season)) {
        affiliationConfidence[affiliation.confidence] += 1;
      }

      const evidenceRows = evidenceForSeason(season);
      if (evidenceRows.length > 0) {
        evidence.seasonRowsWithEvidence += 1;
      }
      for (const observation of evidenceRows) {
        if (observation.status === 'conflicting') {
          evidence.conflictingObservations += 1;
        }
        if (observation.confirmationState === 'unconfirmed') {
          evidence.unconfirmedObservations += 1;
        }
      }
    }
  }

  const coverageBySeason = [...coverageBySeasonMap.values()].sort((a, b) => b.season - a.season);
  const highlightLastSeen = options.highlightLastSeenDropRatio ?? SEASON_COUNT_DROP_HIGHLIGHT_RATIO;

  return {
    generatedAt: data.generatedAt,
    regionCode: data.regionCode,
    regionLabel: data.regionLabel ?? null,
    teamCount: data.teams.length,
    regionEventCount: data.regionEvents.length,
    seasonRowCount,
    seedAgeMs,
    seedStale: seedAgeMs > STALE_SEED_MAX_AGE_MS,
    sourceChecks,
    sourceCheckFailures,
    coverageBySeason,
    missingWebsiteTotal,
    missingOrganizationTotal,
    missingLocationTotal,
    affiliationConfidence,
    evidence,
    unverifiedRelationshipCount: countUnverifiedRelationships(data.teams),
    seasonCountDeltas: buildSeasonCountDeltas(data.teams),
    lastSeenTeamCountDelta: buildLastSeenDelta(
      data.teams.length,
      options.lastSeenTeamCount,
      options.lastSeenAt,
      highlightLastSeen,
    ),
    liveSources,
    liveFailureCount: liveFailureCount(liveSources),
  };
}

export function formatSeedAge(ageMs: number): string {
  const days = ageMs / (24 * 60 * 60 * 1000);
  if (days < 1) {
    const hours = ageMs / (60 * 60 * 1000);
    if (hours < 1) {
      return `${Math.max(1, Math.round(ageMs / (60 * 1000)))}m`;
    }
    return `${Math.round(hours * 10) / 10}h`;
  }
  return `${Math.round(days * 10) / 10}d`;
}
