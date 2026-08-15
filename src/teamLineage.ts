import relationshipOverridesDocument from './data/teamRelationshipOverrides.json';
import { AffiliationConfirmation, SeasonId, Team, TeamSeason } from './data/schema';
import { schoolAffiliations } from './lib/organizationAffiliations';

/** Explicit team–team relationship kinds. Heuristics never emit confirmed succession. */
export type TeamRelationshipType =
  | 'same_school'
  | 'possible_related'
  | 'sister_team'
  | 'possible_renumbering'
  | 'confirmed_predecessor'
  | 'confirmed_successor'
  | 'shared_organization'
  | 'shared_sponsor';

export type RelationshipConfidence = 'high' | 'medium' | 'low';

export type RelationshipEvidence = {
  kind: string;
  label: string;
  detail: string;
  sourceUrl?: string | null;
};

export type TeamLineageLink = {
  teamNumber: number;
  teamName: string;
  seasonRange: string;
  relationshipType: TeamRelationshipType;
  /** Short label kept for snapshots / compact UI. */
  matchReason: string;
  confidenceExplanation: string;
  confidence: RelationshipConfidence;
  confirmationState: AffiliationConfirmation;
  evidence: RelationshipEvidence[];
};

/**
 * Chronological buckets for earlier/later team numbers.
 * These are display orientation only — not succession claims unless
 * `relationshipType` is confirmed_predecessor / confirmed_successor.
 */
export type TeamLineage = {
  priorTeams: TeamLineageLink[];
  successorTeams: TeamLineageLink[];
};

export type TeamRelationshipOverride = {
  teamNumberA: number;
  teamNumberB: number;
  relationshipType: TeamRelationshipType;
  confirmationState: Extract<AffiliationConfirmation, 'confirmed' | 'rejected'>;
  note?: string | null;
};

export type TeamRelationshipOverridesDocument = {
  schemaVersion: number;
  overrides: TeamRelationshipOverride[];
};

const RELATIONSHIP_TYPE_LABELS: Record<TeamRelationshipType, string> = {
  same_school: 'Same school',
  possible_related: 'Possible related',
  sister_team: 'Sister team',
  possible_renumbering: 'Possible renumbering',
  confirmed_predecessor: 'Confirmed predecessor',
  confirmed_successor: 'Confirmed successor',
  shared_organization: 'Shared organization',
  shared_sponsor: 'Shared sponsor',
};

const GENERIC_KEYS = new Set([
  'family community',
  'community',
  'robotics',
  'robot',
  'ftc',
  'first tech challenge',
  '4 h youth development program',
  'university of nevada cooperative extension',
  'tesla',
  'deka foundation',
  'qualcomm inc',
  'nv energy',
  'switch',
  'gobilda',
  'rev robotics',
  'pitsco',
  'andy mark',
  'andymark',
]);

function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/\bhs\b/g, 'high school')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isSchoolish(value: string): boolean {
  return /\b(high school|middle school|elementary|academy|charter|college|university|campus)\b/i.test(value);
}

function splitOrganizationSegments(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(/[/,&]+/)
    .map((segment) => normalizeText(segment))
    .filter((segment) => segment.length >= 4);
}

function extractSchoolKeys(season: TeamSeason): string[] {
  const keys = new Set<string>();

  for (const affiliation of schoolAffiliations(season)) {
    const key = normalizeText(affiliation.name);
    if (key.length >= 4 && isSchoolish(key) && !GENERIC_KEYS.has(key)) {
      keys.add(key);
    }
  }

  if (keys.size === 0) {
    for (const segment of splitOrganizationSegments(season.organization)) {
      if (isSchoolish(segment) && !GENERIC_KEYS.has(segment)) {
        keys.add(segment);
      }
    }
  }

  const normalizedName = normalizeText(season.name.replace(/\([^)]*\)/g, ''));

  if (isSchoolish(normalizedName) && !GENERIC_KEYS.has(normalizedName)) {
    keys.add(normalizedName);
  }

  const nameSchoolMatch = normalizedName.match(
    /(.+(?:high school|middle school|elementary|academy|charter|college|university))/i,
  );

  if (nameSchoolMatch) {
    const key = normalizeText(nameSchoolMatch[1]);

    if (key.length >= 8 && !GENERIC_KEYS.has(key)) {
      keys.add(key);
    }
  }

  return [...keys];
}

function teamSeasonValues(team: Team): TeamSeason[] {
  return Object.values(team.seasons ?? {}).filter(Boolean) as TeamSeason[];
}

function seasonRangeLabel(team: Team): string {
  const seasons = teamSeasonValues(team)
    .map((season) => season.season)
    .sort((a, b) => a - b);

  if (seasons.length === 0) {
    return 'Unknown';
  }

  if (seasons.length === 1) {
    return String(seasons[0]);
  }

  return `${seasons[0]}-${seasons[seasons.length - 1]}`;
}

function seasonBounds(team: Team): { min: SeasonId; max: SeasonId; seasons: Set<SeasonId> } {
  const seasons = teamSeasonValues(team).map((season) => season.season);

  return {
    min: Math.min(...seasons) as SeasonId,
    max: Math.max(...seasons) as SeasonId,
    seasons: new Set(seasons),
  };
}

function citiesForTeam(team: Team): Set<string> {
  return new Set(
    teamSeasonValues(team)
      .map((season) => season.city)
      .filter((city): city is string => Boolean(city)),
  );
}

function nameTokens(team: Team): Set<string> {
  const excluded = new Set([
    'team',
    'robotics',
    'robot',
    'ftc',
    'the',
    'and',
    'high',
    'school',
    'middle',
    'academy',
    'hs',
    'ms',
  ]);

  return new Set(
    teamSeasonValues(team)
      .flatMap((season) => normalizeText(season.name).match(/[a-z0-9]+/g) ?? [])
      .filter((token) => token.length >= 4 && !excluded.has(token)),
  );
}

function seasonsOverlap(left: Set<SeasonId>, right: Set<SeasonId>): boolean {
  for (const season of left) {
    if (right.has(season)) {
      return true;
    }
  }

  return false;
}

function citiesCompatible(left: Set<string>, right: Set<string>): boolean {
  if (left.size === 0 || right.size === 0) {
    return true;
  }

  for (const city of left) {
    if (right.has(city)) {
      return true;
    }
  }

  return false;
}

function sharedNameTokens(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((token) => right.has(token));
}

function schoolKeysForTeam(team: Team): Set<string> {
  return new Set(teamSeasonValues(team).flatMap((season) => extractSchoolKeys(season)));
}

function isSchoolTeam(team: Team): boolean {
  return teamSeasonValues(team).some((season) => season.teamType === 'school');
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function schoolLabel(key: string): string {
  return key.replace(/\bhigh school\b/g, 'HS').replace(/\bmiddle school\b/g, 'MS');
}

function sourceUrlsForTeam(team: Team): string[] {
  return [
    ...new Set(
      teamSeasonValues(team)
        .map((season) => season.sourceUrl)
        .filter((url): url is string => Boolean(url)),
    ),
  ];
}

export function formatRelationshipTypeLabel(type: TeamRelationshipType): string {
  return RELATIONSHIP_TYPE_LABELS[type];
}

export function parseTeamRelationshipOverrides(
  document: unknown = relationshipOverridesDocument,
): TeamRelationshipOverride[] {
  if (!document || typeof document !== 'object') {
    return [];
  }

  const overrides = (document as TeamRelationshipOverridesDocument).overrides;
  if (!Array.isArray(overrides)) {
    return [];
  }

  return overrides.filter(
    (row): row is TeamRelationshipOverride =>
      Boolean(row) &&
      typeof row.teamNumberA === 'number' &&
      typeof row.teamNumberB === 'number' &&
      row.teamNumberA !== row.teamNumberB &&
      typeof row.relationshipType === 'string' &&
      (row.confirmationState === 'confirmed' || row.confirmationState === 'rejected'),
  );
}

type MatchCandidate = {
  left: Team;
  right: Team;
  earlier: Team;
  later: Team;
  sharedKeys: string[];
  sharedTokens: string[];
  gap: number | null;
  seasonsOverlap: boolean;
  multiTeamSchool: boolean;
};

function buildMultiTeamSchoolKeys(teams: Team[]): Set<string> {
  const byKey = new Map<string, Team[]>();

  for (const team of teams) {
    for (const key of schoolKeysForTeam(team)) {
      const list = byKey.get(key) ?? [];
      list.push(team);
      byKey.set(key, list);
    }
  }

  const multi = new Set<string>();

  for (const [key, keyedTeams] of byKey) {
    const unique = [...new Map(keyedTeams.map((team) => [team.number, team])).values()];
    if (unique.length < 2) {
      continue;
    }

    let concurrent = false;
    for (let i = 0; i < unique.length && !concurrent; i += 1) {
      for (let j = i + 1; j < unique.length; j += 1) {
        if (seasonsOverlap(seasonBounds(unique[i]).seasons, seasonBounds(unique[j]).seasons)) {
          concurrent = true;
          break;
        }
      }
    }

    // Concurrent sisters, or three-plus numbers at one school, block auto-renumbering claims.
    if (concurrent || unique.length >= 3) {
      multi.add(key);
    }
  }

  return multi;
}

function evaluatePair(
  teamA: Team,
  teamB: Team,
  multiTeamSchoolKeys: Set<string>,
): MatchCandidate | null {
  if (!citiesCompatible(citiesForTeam(teamA), citiesForTeam(teamB))) {
    return null;
  }

  const keysA = schoolKeysForTeam(teamA);
  const keysB = schoolKeysForTeam(teamB);
  const sharedKeys = [...keysA].filter((key) => keysB.has(key));

  if (sharedKeys.length === 0) {
    return null;
  }

  if (!isSchoolTeam(teamA) && !isSchoolTeam(teamB)) {
    return null;
  }

  const boundsA = seasonBounds(teamA);
  const boundsB = seasonBounds(teamB);
  const overlap = seasonsOverlap(boundsA.seasons, boundsB.seasons);
  const multiTeamSchool = sharedKeys.some((key) => multiTeamSchoolKeys.has(key));

  let earlier = teamA;
  let later = teamB;
  if (overlap) {
    if (teamB.number < teamA.number) {
      earlier = teamB;
      later = teamA;
    }
  } else if (boundsB.max < boundsA.min || boundsB.min < boundsA.min) {
    earlier = teamB;
    later = teamA;
  }

  const earlierBounds = seasonBounds(earlier);
  const laterBounds = seasonBounds(later);
  const gap = overlap ? null : laterBounds.min - earlierBounds.max;

  return {
    left: teamA,
    right: teamB,
    earlier,
    later,
    sharedKeys,
    sharedTokens: sharedNameTokens(nameTokens(teamA), nameTokens(teamB)),
    gap,
    seasonsOverlap: overlap,
    multiTeamSchool,
  };
}

function heuristicRelationshipType(match: MatchCandidate): TeamRelationshipType {
  if (match.seasonsOverlap) {
    return 'sister_team';
  }

  if (
    !match.multiTeamSchool &&
    match.sharedTokens.length > 0 &&
    match.gap != null &&
    match.gap <= 2
  ) {
    return 'possible_renumbering';
  }

  if (match.sharedKeys.length > 0) {
    return 'same_school';
  }

  return 'possible_related';
}

function confidenceForMatch(match: MatchCandidate): RelationshipConfidence | null {
  let score = 0;

  if (match.sharedKeys.length > 0) {
    score += 50;
  }

  if (citiesForTeam(match.left).size > 0 && citiesForTeam(match.right).size > 0) {
    score += 20;
  }

  if (match.sharedTokens.length > 0) {
    score += 15;
  }

  if (match.gap != null && match.gap <= 2) {
    score += 10;
  }

  if (match.seasonsOverlap) {
    score += 10;
  }

  if (isSchoolTeam(match.left) && isSchoolTeam(match.right)) {
    score += 10;
  }

  if (score >= 75) {
    return 'high';
  }

  if (score >= 50) {
    return 'medium';
  }

  return null;
}

function buildEvidence(match: MatchCandidate): RelationshipEvidence[] {
  const school = schoolLabel(match.sharedKeys[0]);
  const evidence: RelationshipEvidence[] = [
    {
      kind: 'shared_school',
      label: 'Shared school affiliation',
      detail: school,
    },
    {
      kind: 'season_range',
      label: 'Season ranges',
      detail: `${seasonRangeLabel(match.earlier)} → ${seasonRangeLabel(match.later)}${
        match.seasonsOverlap ? ' (overlapping)' : ''
      }`,
    },
  ];

  if (match.sharedTokens.length > 0) {
    evidence.push({
      kind: 'name_token_overlap',
      label: 'Shared name tokens',
      detail: match.sharedTokens.join(', '),
    });
  }

  const citiesA = [...citiesForTeam(match.left)];
  const citiesB = [...citiesForTeam(match.right)];
  if (citiesA.length > 0 || citiesB.length > 0) {
    evidence.push({
      kind: 'city_compatibility',
      label: 'City compatibility',
      detail:
        citiesA.length > 0 && citiesB.length > 0
          ? `Compatible cities (${[...new Set([...citiesA, ...citiesB])].join(', ')})`
          : 'City unknown on at least one team; not used to reject',
    });
  }

  for (const url of [...sourceUrlsForTeam(match.left), ...sourceUrlsForTeam(match.right)].slice(0, 4)) {
    evidence.push({
      kind: 'source_url',
      label: 'Public team page',
      detail: url,
      sourceUrl: url,
    });
  }

  evidence.push({
    kind: 'extraction_method',
    label: 'Extraction method',
    detail: 'lineage-heuristic',
  });

  return evidence;
}

function confidenceExplanation(
  match: MatchCandidate,
  type: TeamRelationshipType,
  confidence: RelationshipConfidence,
  confirmationState: AffiliationConfirmation = 'unconfirmed',
): string {
  const school = schoolLabel(match.sharedKeys[0]);
  const parts = [
    confirmationState === 'confirmed'
      ? `Curator-confirmed ${formatRelationshipTypeLabel(type).toLowerCase()} involving shared school (${school})`
      : `Inferred ${formatRelationshipTypeLabel(type).toLowerCase()} from shared school (${school})`,
  ];

  if (match.seasonsOverlap) {
    parts.push('seasons overlap so this is a sister/concurrent relationship, not succession');
  } else if (match.gap != null) {
    parts.push(`non-overlapping seasons with gap ${match.gap}`);
  }

  if (match.sharedTokens.length > 0) {
    parts.push(`shared name tokens: ${match.sharedTokens.join(', ')}`);
  }

  if (match.multiTeamSchool) {
    parts.push('school has concurrent or multi-number program history; not auto-claimed as renumbering');
  }

  if (confirmationState === 'confirmed') {
    parts.push(`${confidence} confidence`);
  } else {
    parts.push(`${confidence} confidence; unconfirmed until curator review`);
  }
  return parts.join('. ') + '.';
}

function matchReason(match: MatchCandidate, type: TeamRelationshipType): string {
  const school = schoolLabel(match.sharedKeys[0]);

  switch (type) {
    case 'sister_team':
      return `Sister team at same school (${school}); overlapping seasons`;
    case 'possible_renumbering':
      return `Possible renumbering at same school (${school}); unconfirmed`;
    case 'same_school':
      return `Same school (${school}); related, not confirmed succession`;
    case 'confirmed_predecessor':
      return `Confirmed predecessor (${school})`;
    case 'confirmed_successor':
      return `Confirmed successor (${school})`;
    default:
      return `Possible related team (${school}); unconfirmed`;
  }
}

function toLink(
  other: Team,
  match: MatchCandidate,
  type: TeamRelationshipType,
  confidence: RelationshipConfidence,
  confirmationState: AffiliationConfirmation = 'unconfirmed',
): TeamLineageLink {
  return {
    teamNumber: other.number,
    teamName: other.latestName,
    seasonRange: seasonRangeLabel(other),
    relationshipType: type,
    matchReason: matchReason(match, type),
    confidenceExplanation: confidenceExplanation(match, type, confidence, confirmationState),
    confidence,
    confirmationState,
    evidence: buildEvidence(match),
  };
}

type EdgeRecord = {
  teamA: number;
  teamB: number;
  earlier: number;
  later: number;
  linkForA: TeamLineageLink;
  linkForB: TeamLineageLink;
};

function orientConfirmedType(
  type: TeamRelationshipType,
  subjectIsEarlier: boolean,
): TeamRelationshipType {
  if (type === 'confirmed_predecessor' || type === 'confirmed_successor') {
    return subjectIsEarlier ? 'confirmed_successor' : 'confirmed_predecessor';
  }
  return type;
}

function applyOverrideToEdge(
  edge: EdgeRecord,
  override: TeamRelationshipOverride,
  teamsByNumber: Map<number, Team>,
): EdgeRecord | null {
  if (override.confirmationState === 'rejected') {
    return null;
  }

  const teamA = teamsByNumber.get(edge.teamA);
  const teamB = teamsByNumber.get(edge.teamB);
  if (!teamA || !teamB) {
    return edge;
  }

  const typeA = orientConfirmedType(override.relationshipType, edge.earlier === edge.teamA);
  const typeB = orientConfirmedType(override.relationshipType, edge.earlier === edge.teamB);
  const note = override.note?.trim();

  const patch = (link: TeamLineageLink, type: TeamRelationshipType): TeamLineageLink => ({
    ...link,
    relationshipType: type,
    confirmationState: 'confirmed',
    confidence: 'high',
    matchReason: note
      ? `${formatRelationshipTypeLabel(type)}: ${note}`
      : formatRelationshipTypeLabel(type),
    confidenceExplanation: note
      ? `Curator-confirmed ${formatRelationshipTypeLabel(type).toLowerCase()}. ${note}`
      : `Curator-confirmed ${formatRelationshipTypeLabel(type).toLowerCase()} via team relationship overrides.`,
    evidence: [
      ...link.evidence,
      {
        kind: 'curator_override',
        label: 'Curator override',
        detail: note || 'confirmed in teamRelationshipOverrides.json',
      },
    ],
  });

  return {
    ...edge,
    linkForA: patch(edge.linkForA, typeA),
    linkForB: patch(edge.linkForB, typeB),
  };
}

function createOverrideOnlyEdge(
  override: TeamRelationshipOverride,
  teamsByNumber: Map<number, Team>,
): EdgeRecord | null {
  if (override.confirmationState === 'rejected') {
    return null;
  }

  const teamA = teamsByNumber.get(override.teamNumberA);
  const teamB = teamsByNumber.get(override.teamNumberB);
  if (!teamA || !teamB) {
    return null;
  }

  const boundsA = seasonBounds(teamA);
  const boundsB = seasonBounds(teamB);
  const earlier = boundsA.min <= boundsB.min ? teamA : teamB;
  const later = earlier.number === teamA.number ? teamB : teamA;
  const sharedKeys = [...schoolKeysForTeam(teamA)].filter((key) => schoolKeysForTeam(teamB).has(key));
  const syntheticMatch: MatchCandidate = {
    left: teamA,
    right: teamB,
    earlier,
    later,
    sharedKeys: sharedKeys.length > 0 ? sharedKeys : ['curator confirmed'],
    sharedTokens: sharedNameTokens(nameTokens(teamA), nameTokens(teamB)),
    gap: seasonsOverlap(boundsA.seasons, boundsB.seasons) ? null : seasonBounds(later).min - seasonBounds(earlier).max,
    seasonsOverlap: seasonsOverlap(boundsA.seasons, boundsB.seasons),
    multiTeamSchool: false,
  };

  const typeForEarlier = orientConfirmedType(override.relationshipType, true);
  const typeForLater = orientConfirmedType(override.relationshipType, false);
  const confidence: RelationshipConfidence = 'high';

  return {
    teamA: teamA.number,
    teamB: teamB.number,
    earlier: earlier.number,
    later: later.number,
    linkForA: toLink(
      teamB,
      syntheticMatch,
      teamA.number === earlier.number ? typeForEarlier : typeForLater,
      confidence,
      'confirmed',
    ),
    linkForB: toLink(
      teamA,
      syntheticMatch,
      teamB.number === earlier.number ? typeForEarlier : typeForLater,
      confidence,
      'confirmed',
    ),
  };
}

export function buildTeamLineageMap(
  teams: Team[],
  overrides: TeamRelationshipOverride[] = parseTeamRelationshipOverrides(),
): Map<number, TeamLineage> {
  const lineage = new Map<number, TeamLineage>();
  const teamsByNumber = new Map(teams.map((team) => [team.number, team]));
  const multiTeamSchoolKeys = buildMultiTeamSchoolKeys(teams);
  const edges = new Map<string, EdgeRecord>();

  for (const team of teams) {
    lineage.set(team.number, { priorTeams: [], successorTeams: [] });
  }

  for (let leftIndex = 0; leftIndex < teams.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < teams.length; rightIndex += 1) {
      const teamA = teams[leftIndex];
      const teamB = teams[rightIndex];
      const match = evaluatePair(teamA, teamB, multiTeamSchoolKeys);
      const confidence = match ? confidenceForMatch(match) : null;

      if (!match || !confidence) {
        continue;
      }

      const type = heuristicRelationshipType(match);
      const key = pairKey(teamA.number, teamB.number);

      edges.set(key, {
        teamA: teamA.number,
        teamB: teamB.number,
        earlier: match.earlier.number,
        later: match.later.number,
        linkForA: toLink(teamB, match, type, confidence),
        linkForB: toLink(teamA, match, type, confidence),
      });
    }
  }

  const rejected = new Set<string>();
  for (const override of overrides) {
    const key = pairKey(override.teamNumberA, override.teamNumberB);
    if (override.confirmationState === 'rejected') {
      rejected.add(key);
      edges.delete(key);
      continue;
    }

    const existing = edges.get(key);
    if (existing) {
      const next = applyOverrideToEdge(existing, override, teamsByNumber);
      if (next) {
        edges.set(key, next);
      } else {
        edges.delete(key);
      }
    } else if (!rejected.has(key)) {
      const created = createOverrideOnlyEdge(override, teamsByNumber);
      if (created) {
        edges.set(key, created);
      }
    }
  }

  for (const edge of edges.values()) {
    const entryA = lineage.get(edge.teamA);
    const entryB = lineage.get(edge.teamB);
    if (!entryA || !entryB) {
      continue;
    }

    if (edge.linkForA.confirmationState === 'rejected' || edge.linkForB.confirmationState === 'rejected') {
      continue;
    }

    if (edge.earlier === edge.teamA) {
      entryA.successorTeams.push(edge.linkForA);
      entryB.priorTeams.push(edge.linkForB);
    } else {
      entryA.priorTeams.push(edge.linkForA);
      entryB.successorTeams.push(edge.linkForB);
    }
  }

  for (const entry of lineage.values()) {
    entry.priorTeams.sort(
      (a, b) => Number(b.seasonRange.split('-')[0]) - Number(a.seasonRange.split('-')[0]) || a.teamNumber - b.teamNumber,
    );
    entry.successorTeams.sort(
      (a, b) => Number(a.seasonRange.split('-')[0]) - Number(b.seasonRange.split('-')[0]) || a.teamNumber - b.teamNumber,
    );
  }

  return lineage;
}

export function getTeamLineage(lineageMap: Map<number, TeamLineage>, teamNumber: number): TeamLineage {
  return lineageMap.get(teamNumber) ?? { priorTeams: [], successorTeams: [] };
}

/** Visible related links for default UI (rejected edges are already omitted). */
export function visibleRelatedLinks(lineage: TeamLineage): TeamLineageLink[] {
  return [...lineage.priorTeams, ...lineage.successorTeams].filter(
    (link) => link.confirmationState !== 'rejected',
  );
}
