import { GeneratedData, RegionEvent, SeasonId, Team } from './schema';

/**
 * Merge a season-scoped refresh into a previous snapshot.
 * Replaces `season` rows for teams present in `refreshedTeams`, drops that
 * season from teams no longer returned, and removes teams left with no seasons.
 * Region events for `season` are replaced; other seasons are preserved.
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
        seasons[season] = nextSeason;
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
