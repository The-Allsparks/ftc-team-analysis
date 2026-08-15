import { SeasonId, Team, TeamSeason } from './data/schema';
import { schoolAffiliations } from './lib/organizationAffiliations';

export type TeamLineageLink = {
  teamNumber: number;
  teamName: string;
  seasonRange: string;
  matchReason: string;
  confidence: 'high' | 'medium';
};

export type TeamLineage = {
  priorTeams: TeamLineageLink[];
  successorTeams: TeamLineageLink[];
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

type MatchCandidate = {
  prior: Team;
  successor: Team;
  sharedKeys: string[];
  sharedTokens: string[];
  gap: number;
};

function evaluateMatch(prior: Team, successor: Team): MatchCandidate | null {
  const priorBounds = seasonBounds(prior);
  const successorBounds = seasonBounds(successor);

  if (seasonsOverlap(priorBounds.seasons, successorBounds.seasons)) {
    return null;
  }

  if (priorBounds.max >= successorBounds.min) {
    return null;
  }

  if (!citiesCompatible(citiesForTeam(prior), citiesForTeam(successor))) {
    return null;
  }

  const priorKeys = schoolKeysForTeam(prior);
  const successorKeys = schoolKeysForTeam(successor);
  const sharedKeys = [...priorKeys].filter((key) => successorKeys.has(key));

  if (sharedKeys.length === 0) {
    return null;
  }

  if (!isSchoolTeam(prior) && !isSchoolTeam(successor)) {
    return null;
  }

  return {
    prior,
    successor,
    sharedKeys,
    sharedTokens: sharedNameTokens(nameTokens(prior), nameTokens(successor)),
    gap: successorBounds.min - priorBounds.max,
  };
}

function confidenceForMatch(match: MatchCandidate): 'high' | 'medium' | null {
  let score = 0;

  if (match.sharedKeys.length > 0) {
    score += 50;
  }

  if (citiesForTeam(match.prior).size > 0 && citiesForTeam(match.successor).size > 0) {
    score += 20;
  }

  if (match.sharedTokens.length > 0) {
    score += 15;
  }

  if (match.gap <= 2) {
    score += 10;
  }

  if (isSchoolTeam(match.prior) && isSchoolTeam(match.successor)) {
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

function matchReason(match: MatchCandidate): string {
  const schoolLabel = match.sharedKeys[0]
    .replace(/\bhigh school\b/g, 'HS')
    .replace(/\bmiddle school\b/g, 'MS');

  if (match.sharedTokens.length > 0) {
    return `Same school (${schoolLabel}) and matching team name`;
  }

  return `Same school (${schoolLabel}), non-overlapping seasons`;
}

function toLink(team: Team, match: MatchCandidate, confidence: 'high' | 'medium'): TeamLineageLink {
  return {
    teamNumber: team.number,
    teamName: team.latestName,
    seasonRange: seasonRangeLabel(team),
    matchReason: matchReason(match),
    confidence,
  };
}

export function buildTeamLineageMap(teams: Team[]): Map<number, TeamLineage> {
  const lineage = new Map<number, TeamLineage>();

  for (const team of teams) {
    lineage.set(team.number, { priorTeams: [], successorTeams: [] });
  }

  for (let leftIndex = 0; leftIndex < teams.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < teams.length; rightIndex += 1) {
      const teamA = teams[leftIndex];
      const teamB = teams[rightIndex];
      const boundsA = seasonBounds(teamA);
      const boundsB = seasonBounds(teamB);

      let prior = teamA;
      let successor = teamB;

      if (boundsA.max >= boundsB.min && boundsB.max >= boundsA.min) {
        continue;
      }

      if (boundsB.max < boundsA.min) {
        prior = teamB;
        successor = teamA;
      }

      const match = evaluateMatch(prior, successor);
      const confidence = match ? confidenceForMatch(match) : null;

      if (!match || !confidence) {
        continue;
      }

      lineage.get(successor.number)?.priorTeams.push(toLink(prior, match, confidence));
      lineage.get(prior.number)?.successorTeams.push(toLink(successor, match, confidence));
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
