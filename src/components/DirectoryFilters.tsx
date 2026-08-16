import { getRegionByCode, groupRegions } from '../data/regions';
import { SeasonId, TeamSeason } from '../data/schema';
import { LiveRefreshStatus } from '../lib/ftcLive';
import {
  AdvancementFilter,
  ALL_SEASONS,
  SeasonFilter,
  advancementLabel,
  seasonLabel,
  teamTypeLabel,
} from '../lib/teamDirectory';

export type DirectoryFiltersProps = {
  regionCode: string;
  liveStatus: LiveRefreshStatus;
  changeRegion: (regionCode: string) => Promise<void> | void;
  query: string;
  setQuery: (value: string) => void;
  seasonFilter: SeasonFilter;
  setSeasonFilter: (value: SeasonFilter) => void;
  seasons: SeasonId[];
  currentSeason: SeasonId;
  availableSeasons: SeasonId[];
  unpublishedCurrent: boolean;
  leagueFilter: string;
  setLeagueFilter: (value: string) => void;
  leagues: string[];
  cityFilters: string[];
  setCityFilters: (value: string[]) => void;
  cities: string[];
  rookieYearFilter: string;
  setRookieYearFilter: (value: string) => void;
  rookieYears: number[];
  teamTypeFilter: string;
  setTeamTypeFilter: (value: string) => void;
  teamTypes: string[];
  advancementFilter: string;
  setAdvancementFilter: (value: string) => void;
  advancementStatuses: string[];
  awardTypeFilter: string;
  setAwardTypeFilter: (value: string) => void;
  awardTypes: string[];
  awardsOnly: boolean;
  setAwardsOnly: (value: boolean) => void;
  portfoliosOnly: boolean;
  setPortfoliosOnly: (value: boolean) => void;
};

export function DirectoryFilters({
  regionCode,
  liveStatus,
  changeRegion,
  query,
  setQuery,
  seasonFilter,
  setSeasonFilter,
  seasons,
  currentSeason,
  availableSeasons,
  unpublishedCurrent,
  leagueFilter,
  setLeagueFilter,
  leagues,
  cityFilters,
  setCityFilters,
  cities,
  rookieYearFilter,
  setRookieYearFilter,
  rookieYears,
  teamTypeFilter,
  setTeamTypeFilter,
  teamTypes,
  advancementFilter,
  setAdvancementFilter,
  advancementStatuses,
  awardTypeFilter,
  setAwardTypeFilter,
  awardTypes,
  awardsOnly,
  setAwardsOnly,
  portfoliosOnly,
  setPortfoliosOnly,
}: DirectoryFiltersProps) {
  return (
    <section className="controls" aria-label="Filters">
      <label>
        Region
        <select
          value={regionCode}
          disabled={liveStatus === 'refreshing'}
          onChange={(event) => void changeRegion(event.target.value)}
        >
          {!getRegionByCode(regionCode) ? <option value={regionCode}>{regionCode}</option> : null}
          {groupRegions().map((group) => (
            <optgroup key={group.group} label={group.label}>
              {group.regions.map((region) => (
                <option key={region.code} value={region.code}>
                  {region.label} ({region.code})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label>
        Search
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Team, city, organization, event, award..."
        />
      </label>
      <label>
        Season
        <select
          value={seasonFilter}
          onChange={(event) =>
            setSeasonFilter(event.target.value === ALL_SEASONS ? ALL_SEASONS : (Number(event.target.value) as SeasonId))
          }
        >
          <option value={ALL_SEASONS}>All seasons</option>
          {seasons.map((season) => (
            <option key={season} value={season}>
              {seasonLabel(season, {
                current: season === currentSeason,
                available:
                  season === currentSeason &&
                  (unpublishedCurrent || !availableSeasons.includes(season))
                    ? false
                    : undefined,
              })}
            </option>
          ))}
        </select>
      </label>
      <label>
        League
        <select value={leagueFilter} onChange={(event) => setLeagueFilter(event.target.value)}>
          <option value="all">All leagues</option>
          {leagues.map((league) => (
            <option key={league} value={league}>
              {league}
            </option>
          ))}
        </select>
      </label>
      <div className="filter-control city-filter">
        <span className="filter-label">City</span>
        <details className="city-picker">
          <summary>{cityFilters.length === 0 ? 'All cities' : `${cityFilters.length} cities selected`}</summary>
          <div className="city-picker-menu">
            <button type="button" className="clear-filter" onClick={() => setCityFilters([])}>
              All cities
            </button>
            <select
              className="multi-select"
              multiple
              size={Math.min(Math.max(cities.length, 4), 8)}
              value={cityFilters}
              onChange={(event) =>
                setCityFilters(Array.from(event.currentTarget.selectedOptions, (option) => option.value))
              }
            >
              {cities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
            <span className="filter-hint">Use Shift or Ctrl to select multiple cities.</span>
          </div>
        </details>
      </div>
      <label>
        Rookie Year
        <select value={rookieYearFilter} onChange={(event) => setRookieYearFilter(event.target.value)}>
          <option value="all">All rookie years</option>
          {rookieYears.map((rookieYear) => (
            <option key={rookieYear} value={rookieYear}>
              {rookieYear}
            </option>
          ))}
        </select>
      </label>
      <label>
        Team Type
        <select value={teamTypeFilter} onChange={(event) => setTeamTypeFilter(event.target.value)}>
          <option value="all">School and non-school</option>
          {teamTypes.map((teamType) => (
            <option key={teamType} value={teamType}>
              {teamTypeLabel(teamType as TeamSeason['teamType'])}
            </option>
          ))}
        </select>
      </label>
      <label>
        Advancing
        <select value={advancementFilter} onChange={(event) => setAdvancementFilter(event.target.value)}>
          <option value="all">All advancement</option>
          {advancementStatuses.map((status) => (
            <option key={status} value={status}>
              {advancementLabel(status as AdvancementFilter)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Award Type
        <select value={awardTypeFilter} onChange={(event) => setAwardTypeFilter(event.target.value)}>
          <option value="all">All award types</option>
          {awardTypes.map((awardType) => (
            <option key={awardType} value={awardType}>
              {awardType}
            </option>
          ))}
        </select>
      </label>
      <label className="checkbox-label">
        <input type="checkbox" checked={awardsOnly} onChange={(event) => setAwardsOnly(event.target.checked)} />
        Teams with awards
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={portfoliosOnly}
          onChange={(event) => setPortfoliosOnly(event.target.checked)}
        />
        Teams in Portfolio Lab
      </label>
    </section>
  );
}
