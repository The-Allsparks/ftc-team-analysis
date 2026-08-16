import type {
  FieldEvidence,
  GeneratedData,
  SeasonId,
  Team,
  TeamObservationRecord,
  TeamObservationsData,
  TeamSeason,
} from '../data/schema';
import {
  CHANGE_TRACKED_FIELDS,
  createEvidence,
  evidenceForSeason,
  mergeSeasonEvidence,
  recordObservation,
} from './fieldEvidence';

export const TEAM_OBSERVATIONS_SCHEMA_VERSION = 1;
export const TEAM_OBSERVATIONS_URL = '/data/nv-ftc-team-observations.generated.json';

export function emptyTeamObservations(
  regionCode: string,
  generatedAt = new Date().toISOString(),
): TeamObservationsData {
  return {
    generatedAt,
    schemaVersion: TEAM_OBSERVATIONS_SCHEMA_VERSION,
    regionCode,
    observations: [],
  };
}

function isTrackedField(field: FieldEvidence['field']): boolean {
  return (CHANGE_TRACKED_FIELDS as readonly string[]).includes(field);
}

export function toObservationRecord(
  teamNumber: number,
  row: FieldEvidence,
): TeamObservationRecord {
  return { ...row, teamNumber };
}

export function observationsForTeamSeason(
  store: TeamObservationsData | null | undefined,
  teamNumber: number,
  season: SeasonId,
): FieldEvidence[] {
  return (store?.observations ?? [])
    .filter((row) => row.teamNumber === teamNumber && row.observedSeason === season)
    .map(({ teamNumber: _teamNumber, ...row }) => row);
}

export function hasObservationsForTeamSeason(
  store: TeamObservationsData | null | undefined,
  teamNumber: number,
  season: SeasonId,
): boolean {
  return (store?.observations ?? []).some(
    (row) => row.teamNumber === teamNumber && row.observedSeason === season,
  );
}

/** Drop season `evidence` arrays so the mega seed stays current-scalars-only. */
export function stripSeasonEvidence(data: GeneratedData): GeneratedData {
  return {
    ...data,
    teams: data.teams.map((team) => ({
      ...team,
      seasons: Object.fromEntries(
        Object.entries(team.seasons).map(([key, season]) => {
          if (!season) {
            return [key, season];
          }
          const { evidence: _evidence, liveSource: _live, ...rest } = season;
          return [key, rest];
        }),
      ) as Team['seasons'],
    })),
  };
}

function trackedEvidenceFromSeason(season: TeamSeason): FieldEvidence[] {
  return evidenceForSeason(season).filter((row) => isTrackedField(row.field));
}

/**
 * First-touch baseline: synthesize tracked observations from season scalars
 * (`retrievedAt` null / offline-synthesize) when the side store has none yet.
 */
export function synthesizeBaselineObservations(
  data: GeneratedData,
  store: TeamObservationsData,
): TeamObservationsData {
  let observations = [...store.observations];

  for (const team of data.teams) {
    for (const season of Object.values(team.seasons)) {
      if (!season) {
        continue;
      }
      if (hasObservationsForTeamSeason({ ...store, observations }, team.number, season.season)) {
        continue;
      }
      const baseline = trackedEvidenceFromSeason({
        ...season,
        evidence: undefined,
      }).map((row) =>
        createEvidence({
          field: row.field,
          value: row.value,
          kind: row.kind,
          sourceType:
            row.sourceType === 'derived' ? 'derived' : 'offline-synthesize',
          sourceUrl: row.sourceUrl,
          retrievedAt: null,
          observedSeason: row.observedSeason,
          extractionMethod: 'offline-synthesize',
          confidence: row.confidence,
          confirmationState: row.confirmationState,
          status: row.status,
          rawValue: row.rawValue,
        }),
      );
      observations = [
        ...observations,
        ...baseline.map((row) => toObservationRecord(team.number, row)),
      ];
    }
  }

  return {
    ...store,
    regionCode: store.regionCode || data.regionCode,
    observations,
  };
}

function replaceTeamSeasonObservations(
  store: TeamObservationsData,
  teamNumber: number,
  season: SeasonId,
  nextRows: FieldEvidence[],
): TeamObservationsData {
  const kept = store.observations.filter(
    (row) => !(row.teamNumber === teamNumber && row.observedSeason === season),
  );
  return {
    ...store,
    observations: [
      ...kept,
      ...nextRows.filter((row) => isTrackedField(row.field)).map((row) => toObservationRecord(teamNumber, row)),
    ],
  };
}

export function mergeIncomingSeasonObservations(
  store: TeamObservationsData,
  teamNumber: number,
  season: SeasonId,
  incoming: FieldEvidence[] | undefined,
): TeamObservationsData {
  const prior = observationsForTeamSeason(store, teamNumber, season);
  const trackedIncoming = (incoming ?? []).filter((row) => isTrackedField(row.field));
  const merged = mergeSeasonEvidence(prior, trackedIncoming);
  return replaceTeamSeasonObservations(store, teamNumber, season, merged);
}

export function recordPresenceDropped(
  store: TeamObservationsData,
  teamNumber: number,
  priorSeason: TeamSeason,
  retrievedAt: string | null,
): TeamObservationsData {
  const prior = observationsForTeamSeason(store, teamNumber, priorSeason.season);
  const dropped = createEvidence({
    field: 'active',
    value: 'false',
    sourceType: 'refresh-presence',
    sourceUrl: priorSeason.sourceUrl,
    retrievedAt,
    observedSeason: priorSeason.season,
    extractionMethod: 'presence-drop',
    confidence: 'medium',
  });
  const merged = recordObservation(prior.length > 0 ? prior : trackedEvidenceFromSeason(priorSeason), dropped);
  return replaceTeamSeasonObservations(store, teamNumber, priorSeason.season, merged);
}

export type SyncObservationsInput = {
  previous: GeneratedData | null;
  previousStore: TeamObservationsData | null;
  candidate: GeneratedData;
  /** When set (current-mode pull), only this season is treated as refreshed for presence drops. */
  refreshedSeason?: SeasonId | null;
  retrievedAt?: string | null;
};

/**
 * Append/merge observations for a pull. Baselines missing seasons from previous
 * (or candidate), merges incoming season evidence, records presence drops.
 */
export function syncObservationsFromPull(input: SyncObservationsInput): TeamObservationsData {
  const retrievedAt = input.retrievedAt ?? input.candidate.generatedAt ?? null;
  let store =
    input.previousStore ??
    emptyTeamObservations(input.candidate.regionCode, input.candidate.generatedAt);

  const baselineSource = input.previous ?? input.candidate;
  store = synthesizeBaselineObservations(baselineSource, store);

  const refreshedSeason = input.refreshedSeason ?? null;
  const candidateByNumber = new Map(input.candidate.teams.map((team) => [team.number, team]));

  for (const team of input.candidate.teams) {
    for (const season of Object.values(team.seasons)) {
      if (!season) {
        continue;
      }
      if (refreshedSeason != null && season.season !== refreshedSeason) {
        continue;
      }
      const incoming =
        season.evidence && season.evidence.length > 0
          ? season.evidence
          : trackedEvidenceFromSeason(season);
      store = mergeIncomingSeasonObservations(store, team.number, season.season, incoming);
    }
  }

  if (input.previous && refreshedSeason != null) {
    for (const priorTeam of input.previous.teams) {
      const priorSeason = priorTeam.seasons[refreshedSeason];
      if (!priorSeason) {
        continue;
      }
      const incomingTeam = candidateByNumber.get(priorTeam.number);
      const stillPresent = Boolean(incomingTeam?.seasons[refreshedSeason]);
      if (!stillPresent) {
        store = recordPresenceDropped(store, priorTeam.number, priorSeason, retrievedAt);
      }
    }
  }

  if (input.previous && refreshedSeason == null) {
    // Full rebuild: seasons present previously but missing on a team in candidate.
    for (const priorTeam of input.previous.teams) {
      const incomingTeam = candidateByNumber.get(priorTeam.number);
      for (const priorSeason of Object.values(priorTeam.seasons)) {
        if (!priorSeason) {
          continue;
        }
        if (!incomingTeam?.seasons[priorSeason.season]) {
          store = recordPresenceDropped(store, priorTeam.number, priorSeason, retrievedAt);
        }
      }
    }
  }

  return {
    ...store,
    generatedAt: input.candidate.generatedAt,
    regionCode: input.candidate.regionCode || store.regionCode,
    schemaVersion: TEAM_OBSERVATIONS_SCHEMA_VERSION,
  };
}

/** Attach side-store history onto season.evidence for UI / live merge. */
export function attachObservationsToData(
  data: GeneratedData,
  store: TeamObservationsData | null | undefined,
): GeneratedData {
  if (!store || store.observations.length === 0) {
    return data;
  }

  return {
    ...data,
    teams: data.teams.map((team) => ({
      ...team,
      seasons: Object.fromEntries(
        Object.entries(team.seasons).map(([key, season]) => {
          if (!season) {
            return [key, season];
          }
          const fromStore = observationsForTeamSeason(store, team.number, season.season);
          if (fromStore.length === 0) {
            return [key, season];
          }
          return [
            key,
            {
              ...season,
              evidence: mergeSeasonEvidence(fromStore, season.evidence),
            },
          ];
        }),
      ) as Team['seasons'],
    })),
  };
}

/** Migrate any seed-embedded evidence into the side store, then strip it. */
export function migrateEmbeddedEvidenceToStore(
  data: GeneratedData,
  store: TeamObservationsData,
): { data: GeneratedData; store: TeamObservationsData } {
  let nextStore = store;
  for (const team of data.teams) {
    for (const season of Object.values(team.seasons)) {
      if (!season?.evidence?.length) {
        continue;
      }
      nextStore = mergeIncomingSeasonObservations(
        nextStore,
        team.number,
        season.season,
        season.evidence,
      );
    }
  }
  nextStore = synthesizeBaselineObservations(data, nextStore);
  return { data: stripSeasonEvidence(data), store: nextStore };
}
