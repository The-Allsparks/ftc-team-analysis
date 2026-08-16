import { GeneratedData, RegionEvent, SeasonId, Team, TeamSeason } from './schema';
import { mergeSeasonEvidence } from '../lib/fieldEvidence';

/**
 * Merge a season-scoped refresh into a previous snapshot.
 * Replaces `season` rows for teams present in `refreshedTeams`, merging
 * `evidence` via {@link mergeSeasonEvidence} so prior observations are kept.
 * Teams no longer returned for `season` keep other seasons; that season row
 * is removed from the seed (presence drop is recorded in the observations
 * side store by pull). Region events for `season` are replaced; other seasons
 * are preserved.
 */
export function mergeSeasonRefresh(
  previous: GeneratedData,
  season: SeasonId,
  refreshedTeams: Team[],
  refreshedRegionEvents: RegionEvent[],
): Pick<GeneratedData, 'teams' | 'regionEvents' | 'targetSeasons'> {
  const refreshedByNumber = new Map(refreshedTeams.map((team) => [team.number, team]));
  const merged = new Map<number, Team>();

  for (const prior of previous.teams) {
    const incoming = refreshedByNumber.get(prior.number);
    const seasons = { ...prior.seasons };

    if (incoming) {
      const nextSeason = incoming.seasons[season];
      if (nextSeason) {
        const priorSeason = prior.seasons[season];
        seasons[season] = mergeSeasonRow(priorSeason, nextSeason);
      } else {
        delete seasons[season];
      }
      refreshedByNumber.delete(prior.number);
    } else {
      delete seasons[season];
    }

    if (Object.keys(seasons).length === 0) {
      continue;
    }

    merged.set(prior.number, {
      ...prior,
      ...(incoming
        ? {
            links: incoming.links.length > 0 ? incoming.links : prior.links,
          }
        : {}),
      seasons,
    });
  }

  for (const incoming of refreshedByNumber.values()) {
    if (Object.keys(incoming.seasons).length === 0) {
      continue;
    }
    merged.set(incoming.number, incoming);
  }

  const teams = [...merged.values()];
  const regionEvents = [
    ...previous.regionEvents.filter((event) => event.season !== season),
    ...refreshedRegionEvents.filter((event) => event.season === season),
  ].sort((a, b) => b.season - a.season || a.code.localeCompare(b.code));

  const targetSeasons = [
    ...new Set([
      ...previous.targetSeasons,
      ...teams.flatMap((team) => Object.keys(team.seasons).map((key) => Number(key) as SeasonId)),
      ...(refreshedTeams.length > 0 ? [season] : []),
    ]),
  ].sort((a, b) => b - a);

  return { teams, regionEvents, targetSeasons };
}

function mergeSeasonRow(prior: TeamSeason | undefined, incoming: TeamSeason): TeamSeason {
  if (!prior) {
    return incoming;
  }
  return {
    ...incoming,
    evidence: mergeSeasonEvidence(prior.evidence, incoming.evidence),
  };
}

/**
 * After a full rebuild, merge prior season evidence into matching candidate rows
 * so a full pull does not wipe in-seed evidence before the side-store sync.
 */
export function mergePriorEvidenceIntoTeams(previous: GeneratedData, teams: Team[]): Team[] {
  const priorByNumber = new Map(previous.teams.map((team) => [team.number, team]));
  return teams.map((team) => {
    const prior = priorByNumber.get(team.number);
    if (!prior) {
      return team;
    }
    const seasons = { ...team.seasons };
    for (const [key, season] of Object.entries(seasons)) {
      if (!season) {
        continue;
      }
      const seasonId = Number(key) as SeasonId;
      const priorSeason = prior.seasons[seasonId];
      if (!priorSeason) {
        continue;
      }
      seasons[seasonId] = mergeSeasonRow(priorSeason, season);
    }
    return { ...team, seasons };
  });
}
