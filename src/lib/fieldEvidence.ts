import type {
  EvidenceConfidence,
  EvidenceConfirmation,
  FactKind,
  FieldEvidence,
  ObservationStatus,
  RecordSummary,
  SeasonId,
  TeamFactField,
  TeamSeason,
} from '../data/schema';

export const TEAM_FACT_FIELDS = [
  'name',
  'location',
  'organization',
  'website',
  'record',
  'qualificationRecord',
  'playoffRecord',
  'rookieYear',
  'league',
  'region',
  'robot',
  'teamType',
  'active',
] as const satisfies readonly TeamFactField[];

/** Fields tracked across refreshes in the observations side store (#29). */
export const CHANGE_TRACKED_FIELDS = [
  'name',
  'location',
  'organization',
  'website',
  'league',
  'region',
  'robot',
  'active',
] as const satisfies readonly TeamFactField[];

export type EvidenceSourceType =
  | 'ftc-events-team-page'
  | 'first-search'
  | 'organization-parse'
  | 'derived'
  | 'offline-synthesize';

export type CreateEvidenceInput = {
  field: TeamFactField;
  value: string;
  kind?: FactKind;
  sourceType: string;
  sourceUrl?: string | null;
  retrievedAt?: string | null;
  observedSeason: SeasonId;
  extractionMethod: string;
  confidence?: EvidenceConfidence;
  confirmationState?: EvidenceConfirmation;
  status?: ObservationStatus;
  rawValue?: string | null;
  supersedesId?: string | null;
  id?: string;
};

function normalizeCompareValue(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Stable id for linking supersede/conflict rows within a season. */
export function makeEvidenceId(
  field: TeamFactField,
  sourceType: string,
  value: string,
  retrievedAt: string | null,
): string {
  return `${field}|${sourceType}|${normalizeCompareValue(value)}|${retrievedAt ?? 'null'}`;
}

export function createEvidence(input: CreateEvidenceInput): FieldEvidence {
  const retrievedAt = input.retrievedAt ?? null;
  const value = input.value.replace(/\s+/g, ' ').trim();
  return {
    id: input.id ?? makeEvidenceId(input.field, input.sourceType, value, retrievedAt),
    field: input.field,
    value,
    kind: input.kind ?? 'observed',
    sourceType: input.sourceType,
    sourceUrl: input.sourceUrl ?? null,
    retrievedAt,
    observedSeason: input.observedSeason,
    extractionMethod: input.extractionMethod,
    confidence: input.confidence ?? 'high',
    confirmationState: input.confirmationState ?? 'unconfirmed',
    status: input.status ?? 'current',
    rawValue: input.rawValue ?? null,
    supersedesId: input.supersedesId ?? null,
  };
}

export function recordSummaryValue(record: RecordSummary | null | undefined): string | null {
  if (!record) {
    return null;
  }
  return record.text || `${record.wins}-${record.losses}-${record.ties}`;
}

export function currentEvidenceForField(
  evidence: FieldEvidence[] | undefined,
  field: TeamFactField,
): FieldEvidence[] {
  return (evidence ?? []).filter((row) => row.field === field && row.status === 'current');
}

export function evidenceForField(
  evidence: FieldEvidence[] | undefined,
  field: TeamFactField,
): FieldEvidence[] {
  return (evidence ?? []).filter((row) => row.field === field);
}

/**
 * Append an observation. Same field + different value marks prior `current` rows
 * as `superseded` (or `conflicting` when `mode` is conflict). Identical values
 * reuse the existing current row (no duplicate churn).
 */
export function recordObservation(
  existing: FieldEvidence[] | undefined,
  incoming: FieldEvidence,
  mode: 'supersede' | 'conflict' = 'supersede',
): FieldEvidence[] {
  const prior = existing ?? [];
  const sameFieldCurrent = prior.filter((row) => row.field === incoming.field && row.status === 'current');
  const identical = sameFieldCurrent.find(
    (row) => normalizeCompareValue(row.value) === normalizeCompareValue(incoming.value),
  );

  if (identical) {
    return prior.map((row) =>
      row.id === identical.id
        ? {
            ...row,
            sourceType: incoming.sourceType || row.sourceType,
            sourceUrl: incoming.sourceUrl ?? row.sourceUrl,
            retrievedAt: incoming.retrievedAt ?? row.retrievedAt,
            extractionMethod: incoming.extractionMethod || row.extractionMethod,
            confidence: incoming.confidence,
            rawValue: incoming.rawValue ?? row.rawValue,
          }
        : row,
    );
  }

  const demoteTo: ObservationStatus = mode === 'conflict' ? 'conflicting' : 'superseded';
  const demotedIds = new Set(sameFieldCurrent.map((row) => row.id));
  const nextPrior = prior.map((row) =>
    demotedIds.has(row.id) ? { ...row, status: demoteTo } : row,
  );

  const primaryPrior = sameFieldCurrent[0];
  const withLink: FieldEvidence = {
    ...incoming,
    status: 'current',
    supersedesId:
      mode === 'supersede' && primaryPrior ? primaryPrior.id : incoming.supersedesId ?? null,
  };

  return [...nextPrior, withLink];
}

/** Merge incoming season evidence into prior rows (live refresh / re-pull). */
export function mergeSeasonEvidence(
  existing: FieldEvidence[] | undefined,
  incoming: FieldEvidence[] | undefined,
): FieldEvidence[] {
  let merged = [...(existing ?? [])];
  for (const row of incoming ?? []) {
    merged = recordObservation(merged, row, 'supersede');
  }
  return merged;
}

export type BuildSeasonEvidenceOptions = {
  sourceType: string;
  sourceUrl: string | null;
  retrievedAt?: string | null;
  extractionMethod?: string;
  nameMethod?: string;
  organizationMethod?: string;
  includeTeamType?: boolean;
};

/**
 * Build observed (+ optional derived teamType) evidence rows from a season's scalars.
 */
export function buildSeasonEvidence(
  season: Pick<
    TeamSeason,
    | 'season'
    | 'active'
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
    | 'sourceUrl'
  >,
  opts: BuildSeasonEvidenceOptions,
): FieldEvidence[] {
  const retrievedAt = opts.retrievedAt ?? null;
  const sourceUrl = opts.sourceUrl ?? season.sourceUrl ?? null;
  const baseMethod = opts.extractionMethod ?? 'html-field';
  const rows: FieldEvidence[] = [];

  const add = (
    field: TeamFactField,
    value: string | null | undefined,
    extra?: Partial<CreateEvidenceInput>,
  ) => {
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
        kind: extra?.kind ?? 'observed',
        sourceType: extra?.sourceType ?? opts.sourceType,
        sourceUrl: extra?.sourceUrl ?? sourceUrl,
        retrievedAt,
        observedSeason: season.season,
        extractionMethod: extra?.extractionMethod ?? baseMethod,
        confidence: extra?.confidence ?? 'high',
        rawValue: extra?.rawValue ?? null,
      }),
    );
  };

  add('name', season.name, { extractionMethod: opts.nameMethod ?? baseMethod });
  add('location', season.location);
  add('organization', season.organization, {
    extractionMethod: opts.organizationMethod ?? baseMethod,
    rawValue: season.organization,
    sourceType: opts.sourceType === 'first-search' ? 'first-search' : opts.sourceType,
  });
  add('website', season.website);
  add('record', recordSummaryValue(season.record));
  add('qualificationRecord', recordSummaryValue(season.qualificationRecord));
  add('playoffRecord', recordSummaryValue(season.playoffRecord));
  add('rookieYear', season.rookieYear != null ? String(season.rookieYear) : null);
  add('league', season.league);
  add('region', season.region);
  add('robot', season.robot);
  if (typeof season.active === 'boolean') {
    add('active', season.active ? 'true' : 'false');
  }

  if (opts.includeTeamType !== false) {
    add('teamType', season.teamType, {
      kind: 'derived',
      sourceType: 'derived',
      extractionMethod: 'heuristic',
      confidence: season.teamType === 'unknown' ? 'low' : 'medium',
    });
  }

  return rows;
}

/**
 * Offline backfill: synthesize evidence from existing season scalars and sourceUrl.
 * Does not hit the network.
 */
export function synthesizeSeasonEvidence(
  season: TeamSeason,
  opts?: { retrievedAt?: string | null },
): FieldEvidence[] {
  const fromSearch = (season.notes ?? []).some((note) => /FIRST Team Search/i.test(note));
  const sourceType: EvidenceSourceType = fromSearch ? 'first-search' : 'ftc-events-team-page';
  return buildSeasonEvidence(season, {
    sourceType,
    sourceUrl: season.sourceUrl,
    retrievedAt: opts?.retrievedAt ?? null,
    extractionMethod: 'offline-synthesize',
    nameMethod: fromSearch ? 'search-index' : 'offline-synthesize',
    organizationMethod: season.organization ? 'offline-synthesize' : 'offline-synthesize',
  });
}

export function attachSynthesizedEvidence(season: TeamSeason, retrievedAt?: string | null): TeamSeason {
  if (season.evidence && season.evidence.length > 0) {
    return season;
  }
  return {
    ...season,
    evidence: synthesizeSeasonEvidence(season, { retrievedAt: retrievedAt ?? null }),
  };
}

/**
 * Prefer stored evidence; otherwise derive display rows from season scalars + sourceUrl
 * (mirror of `affiliationsForSeason`). Does not mutate the season.
 */
export function evidenceForSeason(
  season: Pick<
    TeamSeason,
    | 'season'
    | 'active'
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
    | 'sourceUrl'
    | 'notes'
    | 'evidence'
  >,
): FieldEvidence[] {
  if (season.evidence && season.evidence.length > 0) {
    return season.evidence;
  }
  return synthesizeSeasonEvidence(season as TeamSeason);
}

/** Human-readable one-line provenance for UI. */
export function formatProvenanceSummary(rows: FieldEvidence[]): string {
  const current = rows.filter((row) => row.status === 'current');
  const focus = current[0] ?? rows[0];
  if (!focus) {
    return 'No provenance recorded yet';
  }

  const parts = [focus.sourceType.replace(/-/g, ' ')];
  if (focus.kind === 'derived') {
    parts.unshift('derived');
  }
  if (focus.confidence !== 'high') {
    parts.push(`${focus.confidence} confidence`);
  }
  const conflicts = rows.filter((row) => row.status === 'conflicting').length;
  const superseded = rows.filter((row) => row.status === 'superseded').length;
  if (conflicts > 0) {
    parts.push(`${conflicts} conflicting`);
  }
  if (superseded > 0) {
    parts.push(`${superseded} superseded`);
  }
  return parts.join(' · ');
}

export function evidenceForSeasonField(
  season: Pick<
    TeamSeason,
    | 'season'
    | 'active'
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
    | 'sourceUrl'
    | 'notes'
    | 'evidence'
  >,
  field: TeamFactField,
): FieldEvidence[] {
  return evidenceForField(evidenceForSeason(season), field);
}

/** Human labels for current / season-observed / historically-observed rows (#29). */
export function observationScopeLabel(
  row: FieldEvidence,
  opts?: { isProfileCurrent?: boolean },
): 'current' | 'season' | 'historical' {
  if (row.status === 'superseded' || row.status === 'conflicting') {
    return 'historical';
  }
  if (opts?.isProfileCurrent) {
    return 'current';
  }
  return 'season';
}

export function formatObservationScopeLabel(scope: 'current' | 'season' | 'historical'): string {
  switch (scope) {
    case 'current':
      return 'Current';
    case 'season':
      return 'Observed this season';
    case 'historical':
      return 'Previously observed';
  }
}
