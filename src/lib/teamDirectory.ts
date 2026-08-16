import { PortfolioLabEntry, portfolioMatchesSeason, portfoliosForSeason } from '../data/portfolioLab';
import { isRegionChampionshipEvent } from '../data/regions';
import {
  SeasonId,
  SUPPORTED_SEASONS,
  Team,
  TeamEvent,
  TeamSeason,
} from '../data/schema';
import { affiliationsForSeason } from './organizationAffiliations';

export const ALL_SEASONS = 'all';
export const ALL_FILTER = 'all';

export const SEASON_NAMES: Record<SeasonId, { years: string; game: string }> = {
  2026: { years: '2026-2027', game: 'BIOBUZZ' },
  2025: { years: '2025-2026', game: 'DECODE' },
  2024: { years: '2024-2025', game: 'INTO THE DEEP' },
  2023: { years: '2023-2024', game: 'CENTERSTAGE' },
  2022: { years: '2022-2023', game: 'POWERPLAY' },
  2021: { years: '2021-2022', game: 'FREIGHT FRENZY' },
  2020: { years: '2020-2021', game: 'ULTIMATE GOAL' },
  2019: { years: '2019-2020', game: 'SKYSTONE' },
};

export type SeasonFilter = SeasonId | typeof ALL_SEASONS;
export type AdvancementFilter = 'after-championship' | 'to-championship' | 'not-advancing';

export type FilterCriteria = {
  leagueFilter?: string;
  cityFilters?: string[];
  rookieYearFilter?: string;
  teamTypeFilter?: string;
  advancementFilter?: string;
  awardTypeFilter?: string;
  awardsOnly?: boolean;
  portfoliosOnly?: boolean;
  regionCode?: string;
};

export function seasonValues(team: Team): TeamSeason[] {
  return Object.values(team.seasons ?? {}) as TeamSeason[];
}

export function seasonFor(team: Team, season: SeasonFilter): TeamSeason | null {
  if (season !== ALL_SEASONS) {
    return (team.seasons?.[season] as TeamSeason | undefined) ?? null;
  }

  return (
    SUPPORTED_SEASONS.map((targetSeason) => team.seasons?.[targetSeason] as TeamSeason | undefined).find(Boolean) ??
    null
  );
}

function listText(values: Array<string | number | null | undefined>): string {
  return values.filter(Boolean).join(' ').toLowerCase();
}

export function teamSearchText(team: Team): string {
  const seasons = seasonValues(team);

  return listText([
    team.number,
    team.latestName,
    team.latestLocation,
    team.latestOrganization,
    ...seasons.flatMap((season) => [
      season.name,
      season.location,
      season.organization,
      ...affiliationsForSeason(season).map((row) => row.name),
      season.league,
      season.rookieYear,
      season.teamType,
      ...(season.events ?? []).flatMap((event) => [event.code, event.name, event.location]),
      ...(season.awards ?? []).flatMap((award) => [award.name, award.awardType, award.eventName]),
    ]),
    ...(team.links ?? []).flatMap((link) => [link.label, link.type, link.url]),
  ]);
}

export function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b));
}

export function statLabel(value: number, singular: string, plural = `${singular}s`) {
  return `${value.toLocaleString()} ${value === 1 ? singular : plural}`;
}

export function seasonLabel(season: SeasonId, options?: { current?: boolean; available?: boolean }) {
  const metadata = SEASON_NAMES[season];
  const base = metadata ? `${metadata.years}: ${metadata.game}` : String(season);
  const tags: string[] = [];
  if (options?.current) {
    tags.push('current');
  }
  if (options?.available === false) {
    tags.push('not yet published');
  }
  return tags.length > 0 ? `${base} (${tags.join(', ')})` : base;
}

export function eventKey(event: Partial<TeamEvent>) {
  return event.code ?? event.name ?? 'unknown-event';
}

export function seasonsForFilter(team: Team, season: SeasonFilter): TeamSeason[] {
  if (season === ALL_SEASONS) {
    return seasonValues(team);
  }

  return team.seasons?.[season] ? [team.seasons[season] as TeamSeason] : [];
}

export function teamTypeLabel(value: TeamSeason['teamType']) {
  if (value === 'school') {
    return 'School team';
  }

  if (value === 'non-school') {
    return 'Non-school team';
  }

  return 'Unknown team type';
}

export function advancementStatus(season: TeamSeason, regionCode: string): AdvancementFilter {
  const advancedBeyondChampionship = (season.events ?? []).some(
    (event) =>
      event.code?.startsWith('FTCCMP') ||
      event.code?.startsWith('FPE') ||
      /FIRST Championship|Premier Event/i.test(event.name ?? ''),
  );

  if (advancedBeyondChampionship) {
    return 'after-championship';
  }

  const reachedRegionChampionship = (season.events ?? []).some(
    (event) =>
      isRegionChampionshipEvent(event.code, regionCode) || /Championship/i.test(event.name ?? ''),
  );

  return reachedRegionChampionship ? 'to-championship' : 'not-advancing';
}

export function advancementLabel(value: AdvancementFilter) {
  if (value === 'after-championship') {
    return 'After Championship';
  }

  if (value === 'to-championship') {
    return 'To Championship';
  }

  return 'Not Advancing';
}

export function seasonMatchesCriteria(season: TeamSeason, criteria: FilterCriteria) {
  if (criteria.leagueFilter && criteria.leagueFilter !== ALL_FILTER && season.league !== criteria.leagueFilter) {
    return false;
  }

  if (criteria.cityFilters?.length && (!season.city || !criteria.cityFilters.includes(season.city))) {
    return false;
  }

  if (
    criteria.rookieYearFilter &&
    criteria.rookieYearFilter !== ALL_FILTER &&
    season.rookieYear !== Number(criteria.rookieYearFilter)
  ) {
    return false;
  }

  if (
    criteria.teamTypeFilter &&
    criteria.teamTypeFilter !== ALL_FILTER &&
    season.teamType !== criteria.teamTypeFilter
  ) {
    return false;
  }

  if (
    criteria.advancementFilter &&
    criteria.advancementFilter !== ALL_FILTER &&
    !(
      advancementStatus(season, criteria.regionCode ?? 'USNV') === criteria.advancementFilter ||
      (criteria.advancementFilter === 'to-championship' &&
        advancementStatus(season, criteria.regionCode ?? 'USNV') === 'after-championship')
    )
  ) {
    return false;
  }

  if (criteria.awardTypeFilter && criteria.awardTypeFilter !== ALL_FILTER) {
    const hasAwardType = (season.awards ?? []).some((award) => award.awardType === criteria.awardTypeFilter);

    if (!hasAwardType) {
      return false;
    }
  }

  return !(criteria.awardsOnly && (season.awards?.length ?? 0) === 0);
}

export type FilterTeamsOptions = {
  seasonFilter: SeasonFilter;
  query: string;
  criteria: FilterCriteria;
  portfoliosOnly: boolean;
  portfoliosByTeam: Map<number, PortfolioLabEntry[]>;
};

export function filterTeams(teams: Team[], options: FilterTeamsOptions): Team[] {
  const { seasonFilter, query, criteria, portfoliosOnly, portfoliosByTeam } = options;
  const normalizedQuery = query.trim().toLowerCase();

  return teams
    .filter((team) => {
      const matchingSeasons = seasonsForFilter(team, seasonFilter).filter((season) =>
        seasonMatchesCriteria(season, criteria),
      );

      if (matchingSeasons.length === 0) {
        return false;
      }

      if (portfoliosOnly) {
        const teamPortfolios = portfoliosByTeam.get(team.number) ?? [];

        if (teamPortfolios.length === 0) {
          return false;
        }

        if (
          seasonFilter !== ALL_SEASONS &&
          !teamPortfolios.some((portfolio) => portfolioMatchesSeason(portfolio, seasonFilter))
        ) {
          return false;
        }
      }

      return normalizedQuery.length === 0 || teamSearchText(team).includes(normalizedQuery);
    })
    .sort((a, b) => a.number - b.number);
}

export function visibleSeasonsForTeams(teams: Team[], seasonFilter: SeasonFilter): TeamSeason[] {
  return teams.flatMap((team) =>
    seasonFilter === ALL_SEASONS
      ? seasonValues(team)
      : ([team.seasons?.[seasonFilter]].filter(Boolean) as TeamSeason[]),
  );
}

export function countUniqueEvents(seasons: TeamSeason[]): number {
  return new Set(seasons.flatMap((season) => (season.events ?? []).map(eventKey))).size;
}

export function countAwards(seasons: TeamSeason[]): number {
  return seasons.reduce((total, season) => total + (season.awards?.length ?? 0), 0);
}

export function countPortfolioMatches(
  teams: Team[],
  seasonFilter: SeasonFilter,
  portfoliosByTeam: Map<number, PortfolioLabEntry[]>,
): number {
  return teams.reduce((total, team) => {
    const teamPortfolios = portfoliosByTeam.get(team.number) ?? [];

    if (seasonFilter === ALL_SEASONS) {
      return total + teamPortfolios.length;
    }

    return total + portfoliosForSeason(teamPortfolios, seasonFilter).length;
  }, 0);
}
