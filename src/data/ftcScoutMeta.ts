/**
 * Local FTCScout statistic metadata catalog (v1).
 *
 * Upstream QuickStats / event payloads expose values, ranks, sample size (`count`),
 * and optional `dev` groups — not formula/version fields. This catalog documents
 * how we interpret those fields and links to FTCScout's public API docs.
 */

export const SCOUT_META_CATALOG_VERSION = 'v1' as const;

export const SCOUT_API_DOCS_URL = 'https://ftcscout.org/api';
export const SCOUT_REST_DOCS_URL = 'https://ftcscout.org/api/rest';

/** World-only ranking scope for this release (#18). */
export type ScoutRankingScope = 'world';

export const SCOUT_DEFAULT_RANKING_SCOPE: ScoutRankingScope = 'world';

export const SCOUT_CALCULATED_LABEL =
  'Calculated (FTCScout) — not official FIRST results';

export const SCOUT_CROSS_SEASON_WARNING =
  'OPR and event analytics are season- and game-specific. Do not compare values across seasons.';

export const SCOUT_RANKING_SCOPE_LABEL = 'World ranking scope';

export const SCOUT_SCORE_SPREAD_LABEL = 'Score spread';

export type ScoutStatKind = 'calculated';

export type ScoutStatDefinition = {
  id: string;
  label: string;
  kind: ScoutStatKind;
  definition: string;
  catalogVersion: typeof SCOUT_META_CATALOG_VERSION;
  /** How sample size is sourced from upstream payloads. */
  sampleSizeSource: 'quickStats.count' | 'qualMatchesPlayed';
  rankingScope: ScoutRankingScope;
  docsUrl: string;
};

export const SCOUT_STAT_DEFINITIONS: readonly ScoutStatDefinition[] = [
  {
    id: 'season-opr-total',
    label: 'Total OPR',
    kind: 'calculated',
    definition:
      'Season-level Offensive Power Rating (total points) computed by FTCScout from match results. Ranked against the world pool for the selected season.',
    catalogVersion: SCOUT_META_CATALOG_VERSION,
    sampleSizeSource: 'quickStats.count',
    rankingScope: 'world',
    docsUrl: SCOUT_API_DOCS_URL,
  },
  {
    id: 'season-opr-auto',
    label: 'Auto OPR',
    kind: 'calculated',
    definition:
      'Season-level OPR for autonomous-period scoring contribution, as calculated by FTCScout.',
    catalogVersion: SCOUT_META_CATALOG_VERSION,
    sampleSizeSource: 'quickStats.count',
    rankingScope: 'world',
    docsUrl: SCOUT_API_DOCS_URL,
  },
  {
    id: 'season-opr-teleop',
    label: 'TeleOp OPR',
    kind: 'calculated',
    definition:
      'Season-level OPR for driver-controlled (TeleOp) scoring contribution, as calculated by FTCScout.',
    catalogVersion: SCOUT_META_CATALOG_VERSION,
    sampleSizeSource: 'quickStats.count',
    rankingScope: 'world',
    docsUrl: SCOUT_API_DOCS_URL,
  },
  {
    id: 'season-opr-endgame',
    label: 'Endgame OPR',
    kind: 'calculated',
    definition:
      'Season-level OPR for endgame scoring contribution, as calculated by FTCScout.',
    catalogVersion: SCOUT_META_CATALOG_VERSION,
    sampleSizeSource: 'quickStats.count',
    rankingScope: 'world',
    docsUrl: SCOUT_API_DOCS_URL,
  },
  {
    id: 'event-opr-total',
    label: 'Event OPR',
    kind: 'calculated',
    definition:
      'Event-level total-points OPR from FTCScout team event participation stats. Sample size is qualification matches played at that event when present.',
    catalogVersion: SCOUT_META_CATALOG_VERSION,
    sampleSizeSource: 'qualMatchesPlayed',
    rankingScope: 'world',
    docsUrl: SCOUT_API_DOCS_URL,
  },
  {
    id: 'event-avg-total',
    label: 'Avg Points',
    kind: 'calculated',
    definition:
      'Average alliance total points attributed to the team at an event, from FTCScout event stats.',
    catalogVersion: SCOUT_META_CATALOG_VERSION,
    sampleSizeSource: 'qualMatchesPlayed',
    rankingScope: 'world',
    docsUrl: SCOUT_API_DOCS_URL,
  },
  {
    id: 'event-score-spread',
    label: SCOUT_SCORE_SPREAD_LABEL,
    kind: 'calculated',
    definition:
      'FTCScout `dev.totalPoints` for the event — a points-spread / variability measure across matches. Shown when upstream provides it; not a formal confidence interval.',
    catalogVersion: SCOUT_META_CATALOG_VERSION,
    sampleSizeSource: 'qualMatchesPlayed',
    rankingScope: 'world',
    docsUrl: SCOUT_API_DOCS_URL,
  },
] as const;

export function scoutStatDefinition(id: string): ScoutStatDefinition | undefined {
  return SCOUT_STAT_DEFINITIONS.find((row) => row.id === id);
}

export function isCalculatedScoutStat(id: string): boolean {
  return scoutStatDefinition(id)?.kind === 'calculated';
}

export function scoutSampleSizeCaption(count: number | null | undefined): string | null {
  if (count === null || count === undefined || !Number.isFinite(count) || count <= 0) {
    return null;
  }
  return `Sample size ${count.toLocaleString()} teams (world)`;
}
