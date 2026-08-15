import { useEffect, useMemo, useRef, useState } from 'react';
import rawData from './data/nv-ftc-teams.generated.json';
import { parseGeneratedSeed, SeedIssue } from './data/generatedSeedSchema';
import {
  GeneratedData,
  SeasonId,
  TARGET_SEASONS,
  Team,
  TeamAward,
  TeamEvent,
  TeamSeason,
  seasonOptions,
} from './data/schema';
import { buildTeamLineageMap, getTeamLineage } from './teamLineage';
import { useFtcData } from './hooks/useFtcData';
import { usePortfolioLab } from './hooks/usePortfolioLab';
import {
  portfolioCoverUrl,
  portfolioLabSearchUrl,
  portfolioMatchesSeason,
  portfoliosForSeason,
} from './data/portfolioLab';
import { toPortfolioLabProxyUrl } from './lib/portfolioLab';
import { useFtcScout } from './hooks/useFtcScout';
import {
  formatScoutNumber,
  formatScoutRank,
  ftcScoutEventUrl,
  ftcScoutTeamUrl,
} from './data/ftcScout';
import {
  getRegionByCode,
  groupRegions,
  isRegionChampionshipEvent,
  regionCatalogResult,
} from './data/regions';
import { RegionIssue } from './data/regionCatalogSchema';
import { defaultSeasonWithData } from './lib/ftcSeason';
import { useTeamAvatarCatalog } from './hooks/useTeamAvatarCatalog';
import { TeamAvatar } from './components/TeamAvatar';

function SourceStatusBlock({
  statusClass,
  message,
  diagnostics,
}: {
  statusClass: string;
  message: string | null;
  diagnostics?: string | null;
}) {
  if (!message) {
    return null;
  }

  return (
    <div className="source-status-block">
      <p className={statusClass}>{message}</p>
      {diagnostics ? (
        <details className="source-diagnostics">
          <summary>Technical details</summary>
          <pre>{diagnostics}</pre>
        </details>
      ) : null}
    </div>
  );
}

const seedResult = parseGeneratedSeed(rawData);

if (seedResult.ok && seedResult.quarantined.length > 0) {
  console.warn('[generated-seed] quarantined invalid records', seedResult.quarantined);
}

const ALL_SEASONS = 'all';
const ALL_FILTER = 'all';
const SEASON_NAMES: Record<SeasonId, { years: string; game: string }> = {
  2026: { years: '2026-2027', game: 'BIOBUZZ' },
  2025: { years: '2025-2026', game: 'DECODE' },
  2024: { years: '2024-2025', game: 'INTO THE DEEP' },
  2023: { years: '2023-2024', game: 'CENTERSTAGE' },
  2022: { years: '2022-2023', game: 'POWERPLAY' },
  2021: { years: '2021-2022', game: 'FREIGHT FRENZY' },
  2020: { years: '2020-2021', game: 'ULTIMATE GOAL' },
  2019: { years: '2019-2020', game: 'SKYSTONE' },
};

type SeasonFilter = SeasonId | typeof ALL_SEASONS;
type AdvancementFilter = 'after-championship' | 'to-championship' | 'not-advancing';
type FilterCriteria = {
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

function seasonValues(team: Team): TeamSeason[] {
  return Object.values(team.seasons ?? {}) as TeamSeason[];
}

function seasonFor(team: Team, season: SeasonFilter): TeamSeason | null {
  if (season !== ALL_SEASONS) {
    return (team.seasons?.[season] as TeamSeason | undefined) ?? null;
  }

  return TARGET_SEASONS.map((targetSeason) => team.seasons?.[targetSeason] as TeamSeason | undefined).find(
    Boolean,
  ) ?? null;
}

function listText(values: Array<string | number | null | undefined>): string {
  return values.filter(Boolean).join(' ').toLowerCase();
}

function teamSearchText(team: Team): string {
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
      season.league,
      season.rookieYear,
      season.teamType,
      ...(season.events ?? []).flatMap((event) => [event.code, event.name, event.location]),
      ...(season.awards ?? []).flatMap((award) => [award.name, award.awardType, award.eventName]),
    ]),
    ...(team.links ?? []).flatMap((link) => [link.label, link.type, link.url]),
  ]);
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b));
}

function statLabel(value: number, singular: string, plural = `${singular}s`) {
  return `${value.toLocaleString()} ${value === 1 ? singular : plural}`;
}

function seasonLabel(season: SeasonId) {
  const metadata = SEASON_NAMES[season];

  return metadata ? `${metadata.years}: ${metadata.game}` : String(season);
}

function eventKey(event: Partial<TeamEvent>) {
  return event.code ?? event.name ?? 'unknown-event';
}

function awardKey(award: Partial<TeamAward>, index: number) {
  return `${award.name ?? 'award'}-${award.eventName ?? 'event'}-${index}`;
}

function seasonsForFilter(team: Team, season: SeasonFilter): TeamSeason[] {
  if (season === ALL_SEASONS) {
    return seasonValues(team);
  }

  return team.seasons?.[season] ? [team.seasons[season] as TeamSeason] : [];
}

function teamTypeLabel(value: TeamSeason['teamType']) {
  if (value === 'school') {
    return 'School team';
  }

  if (value === 'non-school') {
    return 'Non-school team';
  }

  return 'Unknown team type';
}

function advancementStatus(season: TeamSeason, regionCode: string): AdvancementFilter {
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

function advancementLabel(value: AdvancementFilter) {
  if (value === 'after-championship') {
    return 'After Championship';
  }

  if (value === 'to-championship') {
    return 'To Championship';
  }

  return 'Not Advancing';
}

function seasonMatchesCriteria(season: TeamSeason, criteria: FilterCriteria) {
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

function SeedEnvelopeError({ issues }: { issues: SeedIssue[] }) {
  return (
    <main className="app-shell">
      <h1>Generated seed failed validation</h1>
      <p className="live-status error">
        The checked-in Nevada snapshot is not a valid GeneratedData envelope, so the team directory was not
        loaded.
      </p>
      <ul>
        {issues.map((issue) => (
          <li key={`${issue.path}:${issue.message}:${issue.teamNumber ?? ''}`}>
            {issue.path}: {issue.message}
            {issue.teamNumber !== undefined ? ` (team ${issue.teamNumber})` : ''}
          </li>
        ))}
      </ul>
    </main>
  );
}

function RegionCatalogEnvelopeError({ issues }: { issues: RegionIssue[] }) {
  return (
    <main className="app-shell">
      <h1>Region catalog failed validation</h1>
      <p className="live-status error">
        The checked-in region catalog is not a valid envelope, so region switching was not loaded.
      </p>
      <ul>
        {issues.map((issue) => (
          <li key={`${issue.path}:${issue.message}:${issue.code ?? ''}`}>
            {issue.path}: {issue.message}
            {issue.code !== undefined ? ` (region ${issue.code})` : ''}
          </li>
        ))}
      </ul>
    </main>
  );
}

export default function App() {
  if (!seedResult.ok) {
    return <SeedEnvelopeError issues={seedResult.issues} />;
  }

  if (!regionCatalogResult.ok) {
    return <RegionCatalogEnvelopeError issues={regionCatalogResult.issues} />;
  }

  return <AppDirectory seedData={seedResult.data} />;
}

function AppDirectory({ seedData }: { seedData: GeneratedData }) {
  const {
    data,
    regionCode,
    regionName,
    liveStatus,
    liveMessage,
    liveDiagnostics,
    liveProgress,
    changeRegion,
    refreshRegion,
    refreshSeason,
    refreshTeam,
    ensureSeasonData,
  } = useFtcData(seedData);
  const {
    portfoliosByTeam,
    status: portfolioStatus,
    message: portfolioMessage,
    diagnostics: portfolioDiagnostics,
    refreshCatalog: refreshPortfolioCatalog,
  } = usePortfolioLab();
  const {
    getTeamScoutData,
    scoutStatus,
    scoutMessage,
    scoutDiagnostics,
    loadTeamScout,
  } = useFtcScout();
  const seasons = useMemo(() => seasonOptions(data), [data]);
  const defaultSeason = useMemo(() => defaultSeasonWithData(seasons, data.teams), [data.teams, seasons]);
  const teamLineageMap = useMemo(() => buildTeamLineageMap(data.teams), [data.teams]);
  const [query, setQuery] = useState('');
  const [seasonFilter, setSeasonFilter] = useState<SeasonFilter>(defaultSeason);
  const [leagueFilter, setLeagueFilter] = useState('all');
  const [cityFilters, setCityFilters] = useState<string[]>([]);
  const [rookieYearFilter, setRookieYearFilter] = useState('all');
  const [teamTypeFilter, setTeamTypeFilter] = useState('all');
  const [advancementFilter, setAdvancementFilter] = useState('all');
  const [awardTypeFilter, setAwardTypeFilter] = useState('all');
  const [awardsOnly, setAwardsOnly] = useState(false);
  const [portfoliosOnly, setPortfoliosOnly] = useState(false);
  const [selectedTeamNumber, setSelectedTeamNumber] = useState<number | null>(data.teams[0]?.number ?? null);
  const [detailSeason, setDetailSeason] = useState<SeasonId | null>(defaultSeason);
  const lastTeamRefreshKey = useRef<string | null>(null);
  const lastScoutRefreshKey = useRef<string | null>(null);

  const seasonScopedSeasons = useMemo(
    () => data.teams.flatMap((team) => seasonsForFilter(team, seasonFilter)),
    [seasonFilter],
  );

  const leagues = useMemo(() => uniqueSorted(seasonScopedSeasons.map((season) => season.league)), [seasonScopedSeasons]);

  const cities = useMemo(
    () =>
      uniqueSorted(
        seasonScopedSeasons
          .filter((season) => seasonMatchesCriteria(season, { leagueFilter }))
          .map((season) => season.city),
      ),
    [leagueFilter, seasonScopedSeasons],
  );

  const rookieYears = useMemo(
    () =>
      [
        ...new Set(
          seasonScopedSeasons
            .filter((season) => seasonMatchesCriteria(season, { leagueFilter, cityFilters }))
            .map((season) => season.rookieYear)
            .filter((rookieYear): rookieYear is number => typeof rookieYear === 'number'),
        ),
      ].sort((a, b) => Number(a) - Number(b)),
    [cityFilters, leagueFilter, seasonScopedSeasons],
  );

  const teamTypes = useMemo(
    () =>
      uniqueSorted(
        seasonScopedSeasons
          .filter((season) => seasonMatchesCriteria(season, { leagueFilter, cityFilters, rookieYearFilter }))
          .map((season) => season.teamType),
      ),
    [cityFilters, leagueFilter, rookieYearFilter, seasonScopedSeasons],
  );

  const advancementStatuses = useMemo(
    () =>
      uniqueSorted(
        seasonScopedSeasons
          .filter((season) =>
            seasonMatchesCriteria(season, { leagueFilter, cityFilters, rookieYearFilter, teamTypeFilter }),
          )
          .map((season) => advancementStatus(season, regionCode)),
      ),
    [cityFilters, leagueFilter, rookieYearFilter, seasonScopedSeasons, teamTypeFilter],
  );

  const awardTypes = useMemo(
    () =>
      uniqueSorted(
        seasonScopedSeasons
          .filter((season) =>
            seasonMatchesCriteria(season, {
              leagueFilter,
              cityFilters,
              rookieYearFilter,
              teamTypeFilter,
              advancementFilter,
            }),
          )
          .flatMap((season) => (season.awards ?? []).map((award) => award.awardType)),
      ),
    [advancementFilter, cityFilters, leagueFilter, rookieYearFilter, seasonScopedSeasons, teamTypeFilter],
  );

  useEffect(() => {
    if (leagueFilter !== ALL_FILTER && !leagues.includes(leagueFilter)) {
      setLeagueFilter(ALL_FILTER);
    }
  }, [leagueFilter, leagues]);

  useEffect(() => {
    const validSelectedCities = cityFilters.filter((city) => cities.includes(city));

    if (validSelectedCities.length !== cityFilters.length) {
      setCityFilters(validSelectedCities);
    }
  }, [cities, cityFilters]);

  useEffect(() => {
    if (rookieYearFilter !== ALL_FILTER && !rookieYears.includes(Number(rookieYearFilter))) {
      setRookieYearFilter(ALL_FILTER);
    }
  }, [rookieYearFilter, rookieYears]);

  useEffect(() => {
    if (teamTypeFilter !== ALL_FILTER && !teamTypes.includes(teamTypeFilter)) {
      setTeamTypeFilter(ALL_FILTER);
    }
  }, [teamTypeFilter, teamTypes]);

  useEffect(() => {
    if (advancementFilter !== ALL_FILTER && !advancementStatuses.includes(advancementFilter)) {
      setAdvancementFilter(ALL_FILTER);
    }
  }, [advancementFilter, advancementStatuses]);

  useEffect(() => {
    if (awardTypeFilter !== ALL_FILTER && !awardTypes.includes(awardTypeFilter)) {
      setAwardTypeFilter(ALL_FILTER);
    }
  }, [awardTypeFilter, awardTypes]);

  const filteredTeams = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return data.teams
      .filter((team) => {
        const matchingSeasons = seasonsForFilter(team, seasonFilter).filter((season) =>
          seasonMatchesCriteria(season, {
            leagueFilter,
            cityFilters,
            rookieYearFilter,
            teamTypeFilter,
            advancementFilter,
            awardTypeFilter,
            awardsOnly,
            regionCode,
          }),
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
  }, [
    advancementFilter,
    awardTypeFilter,
    awardsOnly,
    cityFilters,
    leagueFilter,
    portfoliosByTeam,
    portfoliosOnly,
    query,
    regionCode,
    rookieYearFilter,
    seasonFilter,
    teamTypeFilter,
  ]);

  const selectedTeam =
    filteredTeams.find((team) => team.number === selectedTeamNumber) ?? filteredTeams[0] ?? data.teams[0] ?? null;
  const selectedSeasons = selectedTeam ? seasonValues(selectedTeam).sort((a, b) => b.season - a.season) : [];
  const selectedSeason =
    selectedSeasons.find((season) => season.season === detailSeason) ?? selectedSeasons[0] ?? null;
  const avatarSeason: SeasonId | null =
    seasonFilter !== ALL_SEASONS ? seasonFilter : (selectedSeason?.season ?? detailSeason ?? defaultSeason);
  const {
    getAvatarUrl,
    status: avatarStatus,
    message: avatarMessage,
    diagnostics: avatarDiagnostics,
  } = useTeamAvatarCatalog(avatarSeason);
  const selectedLineage = selectedTeam ? getTeamLineage(teamLineageMap, selectedTeam.number) : null;
  const selectedPortfolios = useMemo(() => {
    if (!selectedTeam) {
      return [];
    }

    const teamPortfolios = portfoliosByTeam.get(selectedTeam.number) ?? [];

    if (!selectedSeason) {
      return teamPortfolios;
    }

    return [...teamPortfolios].sort((left, right) => {
      const leftMatches = portfolioMatchesSeason(left, selectedSeason.season) ? 0 : 1;
      const rightMatches = portfolioMatchesSeason(right, selectedSeason.season) ? 0 : 1;

      return leftMatches - rightMatches;
    });
  }, [portfoliosByTeam, selectedSeason, selectedTeam]);
  const selectedScoutData = selectedTeam && selectedSeason
    ? getTeamScoutData(selectedSeason.season, selectedTeam.number)
    : null;
  const relatedTeams = selectedLineage
    ? [...selectedLineage.priorTeams, ...selectedLineage.successorTeams]
    : [];

  useEffect(() => {
    if (selectedTeam && !filteredTeams.some((team) => team.number === selectedTeam.number)) {
      setSelectedTeamNumber(filteredTeams[0]?.number ?? null);
    }
  }, [filteredTeams, selectedTeam]);

  useEffect(() => {
    lastTeamRefreshKey.current = null;
    lastScoutRefreshKey.current = null;
    setSelectedTeamNumber(null);
    setSeasonFilter(defaultSeason);
    setDetailSeason(defaultSeason);
    setLeagueFilter(ALL_FILTER);
    setCityFilters([]);
    setRookieYearFilter(ALL_FILTER);
    setTeamTypeFilter(ALL_FILTER);
    setAdvancementFilter(ALL_FILTER);
    setAwardTypeFilter(ALL_FILTER);
    setAwardsOnly(false);
    setPortfoliosOnly(false);
    setQuery('');
  }, [defaultSeason, regionCode]);

  useEffect(() => {
    if (seasonFilter === ALL_SEASONS || liveStatus === 'refreshing') {
      return;
    }

    void ensureSeasonData(seasonFilter);
  }, [ensureSeasonData, liveStatus, seasonFilter]);

  useEffect(() => {
    if (selectedSeason) {
      setDetailSeason(selectedSeason.season);
    }
  }, [selectedTeam?.number, selectedSeason?.season]);

  useEffect(() => {
    if (!selectedSeason || !selectedTeam || liveStatus === 'refreshing') {
      return;
    }

    const refreshKey = `${selectedTeam.number}:${selectedSeason.season}`;

    if (lastTeamRefreshKey.current === refreshKey) {
      return;
    }

    lastTeamRefreshKey.current = refreshKey;
    void refreshTeam(selectedSeason.season, selectedTeam.number);
  }, [liveStatus, refreshTeam, selectedSeason?.season, selectedTeam?.number]);

  useEffect(() => {
    if (!selectedSeason || !selectedTeam) {
      return;
    }

    const refreshKey = `${selectedTeam.number}:${selectedSeason.season}`;

    if (lastScoutRefreshKey.current === refreshKey) {
      return;
    }

    lastScoutRefreshKey.current = refreshKey;
    void loadTeamScout(selectedSeason.season, selectedTeam.number);
  }, [loadTeamScout, selectedSeason?.season, selectedTeam?.number]);

  const visibleSeasonValues = useMemo(
    () =>
      filteredTeams.flatMap((team) =>
        seasonFilter === ALL_SEASONS
          ? seasonValues(team)
          : ([team.seasons?.[seasonFilter]].filter(Boolean) as TeamSeason[]),
      ),
    [filteredTeams, seasonFilter],
  );
  const eventCount = new Set(
    visibleSeasonValues.flatMap((season) => (season.events ?? []).map(eventKey)),
  ).size;
  const awardCount = visibleSeasonValues.reduce((total, season) => total + (season.awards?.length ?? 0), 0);
  const portfolioCount = filteredTeams.reduce((total, team) => {
    const teamPortfolios = portfoliosByTeam.get(team.number) ?? [];

    if (seasonFilter === ALL_SEASONS) {
      return total + teamPortfolios.length;
    }

    return total + portfoliosForSeason(teamPortfolios, seasonFilter).length;
  }, 0);
  const activeSeasonCount = visibleSeasonValues.length;

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">
            By{' '}
            <a className="brand-link" href="https://www.theallsparks.org/" target="_blank" rel="noreferrer">
              The Allsparks
            </a>
          </p>
          <h1>{regionName} FTC Team Analysis</h1>
          <p className="hero-copy">
            Explore {regionName}-region FTC teams across seasons. Empty seasons (like a brand-new BIOBUZZ
            snapshot) pull automatically from FTC Events. Nevada also keeps the checked-in multi-season
            snapshot.
          </p>
        </div>
        <div className="source-card">
          <span>Snapshot</span>
          <strong>{new Date(data.generatedAt).toLocaleString()}</strong>
          {data.liveRefreshedAt && (
            <>
              <span>Live cache</span>
              <strong>{new Date(data.liveRefreshedAt).toLocaleString()}</strong>
            </>
          )}
          <div className="refresh-actions">
            <button
              type="button"
              disabled={liveStatus === 'refreshing'}
              onClick={() => void refreshRegion(defaultSeason, true)}
            >
              Refresh roster
            </button>
            <button
              type="button"
              disabled={liveStatus === 'refreshing'}
              onClick={() => void refreshSeason(seasonFilter === ALL_SEASONS ? defaultSeason : seasonFilter, true)}
            >
              Refresh season
            </button>
          </div>
          {liveMessage && (
            <SourceStatusBlock
              statusClass={`live-status ${liveStatus}`}
              message={liveMessage}
              diagnostics={liveDiagnostics}
            />
          )}
          {liveProgress && liveProgress.total > 1 && (
            <p className="live-progress">
              {liveProgress.label} ({liveProgress.completed}/{liveProgress.total})
            </p>
          )}
          <a href={`https://ftc-events.firstinspires.org/${defaultSeason}/region/${regionCode}`} target="_blank" rel="noreferrer">
            {regionName} region source
          </a>
          <a href="https://www.ftcportfoliolab.org/portfolio" target="_blank" rel="noreferrer">
            FTC Portfolio Lab
          </a>
          <a href="https://ftcscout.org" target="_blank" rel="noreferrer">
            FTCScout
          </a>
          {portfolioMessage && (
            <SourceStatusBlock
              statusClass={`portfolio-status ${portfolioStatus}`}
              message={portfolioMessage}
              diagnostics={portfolioDiagnostics}
            />
          )}
          {avatarStatus === 'error' && avatarMessage && (
            <SourceStatusBlock
              statusClass="avatar-status error"
              message={avatarMessage}
              diagnostics={avatarDiagnostics}
            />
          )}
        </div>
      </header>

      <section className="stats-grid" aria-label="Data summary">
        <article>
          <span>{filteredTeams.length}</span>
          <p>{statLabel(filteredTeams.length, 'team')}</p>
        </article>
        <article>
          <span>{activeSeasonCount}</span>
          <p>{statLabel(activeSeasonCount, 'team-season')}</p>
        </article>
        <article>
          <span>{eventCount}</span>
          <p>{statLabel(eventCount, 'parsed event')}</p>
        </article>
        <article>
          <span>{awardCount}</span>
          <p>{statLabel(awardCount, 'award')}</p>
        </article>
        <article>
          <span>{portfolioCount}</span>
          <p>{statLabel(portfolioCount, 'portfolio match', 'portfolio matches')}</p>
        </article>
      </section>

      <section className="controls" aria-label="Filters">
        <label>
          Region
          <select
            value={regionCode}
            disabled={liveStatus === 'refreshing'}
            onChange={(event) => void changeRegion(event.target.value)}
          >
            {!getRegionByCode(regionCode) ? (
              <option value={regionCode}>{regionCode}</option>
            ) : null}
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
              setSeasonFilter(event.target.value === ALL_SEASONS ? ALL_SEASONS : Number(event.target.value) as SeasonId)
            }
          >
            <option value={ALL_SEASONS}>All seasons</option>
            {seasons.map((season) => (
              <option key={season} value={season}>
                {seasonLabel(season)}
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
          <input
            type="checkbox"
            checked={awardsOnly}
            onChange={(event) => setAwardsOnly(event.target.checked)}
          />
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

      <section className="workspace">
        <aside className="team-list" aria-label="Filtered teams">
          <div className="section-heading">
            <h2>Teams</h2>
            <span>{filteredTeams.length} shown</span>
          </div>
          <div className="team-list-scroll">
            {filteredTeams.map((team) => {
              const season = seasonFor(team, seasonFilter);
              const awards = seasonValues(team).reduce((total, item) => total + (item.awards?.length ?? 0), 0);
              const events = seasonValues(team).reduce((total, item) => total + (item.events?.length ?? 0), 0);
              const teamPortfolios = portfoliosByTeam.get(team.number) ?? [];
              const portfolios =
                seasonFilter === ALL_SEASONS
                  ? teamPortfolios.length
                  : portfoliosForSeason(teamPortfolios, seasonFilter).length;

              return (
                <button
                  key={team.number}
                  className={team.number === selectedTeam?.number ? 'team-row selected' : 'team-row'}
                  onClick={() => setSelectedTeamNumber(team.number)}
                >
                  <span className="team-row-leading">
                    <TeamAvatar
                      teamNumber={team.number}
                      name={team.latestName}
                      imageUrl={getAvatarUrl(team.number)}
                      size="sm"
                    />
                    <span className="team-number">{team.number}</span>
                  </span>
                  <span className="team-main">
                    <strong>{team.latestName}</strong>
                    <small>{season?.location ?? team.latestLocation}</small>
                  </span>
                  <span className="team-meta">
                    {events > 0 && <span>{events} events</span>}
                    {awards > 0 && <span>{awards} awards</span>}
                    {portfolios > 0 && <span>{portfolios} portfolios</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="detail-panel" aria-label="Team details">
          {selectedTeam && selectedSeason ? (
            <>
              <div className="detail-header">
                <div className="detail-header-title">
                  <TeamAvatar
                    teamNumber={selectedTeam.number}
                    name={selectedSeason.name}
                    imageUrl={getAvatarUrl(selectedTeam.number)}
                    size="md"
                  />
                  <div>
                    <p className="eyebrow">Team {selectedTeam.number}</p>
                    <h2>{selectedTeam.latestName}</h2>
                    <p>
                      {selectedSeason.location}
                      {selectedSeason.league ? ` - ${selectedSeason.league}` : ''}
                    </p>
                  </div>
                </div>
                <div className="detail-actions">
                  <button
                    type="button"
                    disabled={liveStatus === 'refreshing'}
                    onClick={() => void refreshTeam(selectedSeason.season, selectedTeam.number, true)}
                  >
                    Refresh all seasons
                  </button>
                  <a className="source-link" href={selectedSeason.sourceUrl} target="_blank">
                    Public team page
                  </a>
                </div>
              </div>

              <div className="season-tabs" aria-label="Team seasons">
                {selectedSeasons.map((season) => (
                  <button
                    key={season.season}
                    className={season.season === selectedSeason.season ? 'active' : ''}
                    onClick={() => setDetailSeason(season.season)}
                  >
                    {seasonLabel(season.season)}
                  </button>
                ))}
              </div>

              <div className="identity-grid">
                <div>
                  <span>Organization / Sponsors</span>
                  <strong>{selectedSeason.organization ?? 'Not available publicly yet'}</strong>
                </div>
                <div>
                  <span>Rookie Year</span>
                  <strong>{selectedSeason.rookieYear ?? 'Unknown'}</strong>
                </div>
                <div>
                  <span>Team Type</span>
                  <strong>{teamTypeLabel(selectedSeason.teamType)}</strong>
                </div>
                <div>
                  <span>Advancement</span>
                  <strong>{advancementLabel(advancementStatus(selectedSeason, regionCode))}</strong>
                </div>
                <div>
                  <span>Season Record</span>
                  <strong>{selectedSeason.record?.text ?? 'Not parsed yet'}</strong>
                  {selectedSeason.record && <small className="record-key">W-L-T = wins-losses-ties</small>}
                </div>
                <div>
                  <span>Robot</span>
                  <strong>{selectedSeason.robot ?? 'Not listed'}</strong>
                </div>
              </div>

              {selectedSeason.summary && <p className="summary">{selectedSeason.summary}</p>}
              {selectedSeason.liveSource && !selectedSeason.liveSource.ok && (
                <SourceStatusBlock
                  statusClass="live-status error"
                  message={
                    selectedSeason.liveSource.userMessage ??
                    'Could not refresh the live FTC Events page. Showing the placeholder season row.'
                  }
                  diagnostics={selectedSeason.liveSource.diagnostics}
                />
              )}

              <section className="scout-panel">
                <div className="section-heading">
                  <h3>FTCScout Analytics</h3>
                  <span>{selectedScoutData?.events.length ?? 0}</span>
                </div>
                {scoutStatus === 'loading' && !selectedScoutData ? (
                  <p className="empty-note">Loading OPR and event analytics from FTCScout...</p>
                ) : scoutStatus === 'error' && !selectedScoutData?.quickStats ? (
                  <p className="empty-note">
                    FTCScout stats are temporarily unavailable for this team. Try refresh analytics again shortly.
                  </p>
                ) : selectedScoutData?.quickStats ? (
                  <div className="scout-quick-stats">
                    <article>
                      <span>Total OPR</span>
                      <strong>{formatScoutNumber(selectedScoutData.quickStats.tot.value)}</strong>
                      <small>{formatScoutRank(selectedScoutData.quickStats.tot.rank)} world</small>
                    </article>
                    <article>
                      <span>Auto OPR</span>
                      <strong>{formatScoutNumber(selectedScoutData.quickStats.auto.value)}</strong>
                      <small>{formatScoutRank(selectedScoutData.quickStats.auto.rank)} world</small>
                    </article>
                    <article>
                      <span>TeleOp OPR</span>
                      <strong>{formatScoutNumber(selectedScoutData.quickStats.dc.value)}</strong>
                      <small>{formatScoutRank(selectedScoutData.quickStats.dc.rank)} world</small>
                    </article>
                    <article>
                      <span>Endgame OPR</span>
                      <strong>{formatScoutNumber(selectedScoutData.quickStats.eg.value)}</strong>
                      <small>{formatScoutRank(selectedScoutData.quickStats.eg.rank)} world</small>
                    </article>
                  </div>
                ) : (
                  <p className="empty-note">
                    FTCScout does not have season-level quick stats for this team yet.
                  </p>
                )}
                {(selectedScoutData?.events.length ?? 0) > 0 && (
                  <div className="table-wrap scout-event-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Event</th>
                          <th>Rank</th>
                          <th>Record</th>
                          <th>Event OPR</th>
                          <th>Avg Points</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedScoutData!.events.map((participation) => {
                          const eventName =
                            selectedSeason.events?.find((event) => event.code === participation.eventCode)?.name ??
                            data.regionEvents.find(
                              (event) =>
                                event.season === selectedSeason.season && event.code === participation.eventCode,
                            )?.name ??
                            participation.eventCode;

                          return (
                            <tr key={`${participation.season}-${participation.eventCode}`}>
                              <td>
                                <a
                                  href={ftcScoutEventUrl(selectedSeason.season, participation.eventCode)}
                                  target="_blank"
                                >
                                  {eventName}
                                </a>
                              </td>
                              <td>{participation.stats?.rank ?? '-'}</td>
                              <td>
                                {participation.stats
                                  ? `${participation.stats.wins}-${participation.stats.losses}-${participation.stats.ties}`
                                  : '-'}
                              </td>
                              <td>{formatScoutNumber(participation.stats?.opr?.totalPoints ?? null)}</td>
                              <td>{formatScoutNumber(participation.stats?.avg?.totalPoints ?? null)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="scout-toolbar">
                  <a href={ftcScoutTeamUrl(selectedTeam.number, selectedSeason.season)} target="_blank">
                    Open on FTCScout
                  </a>
                  <button
                    type="button"
                    disabled={scoutStatus === 'loading'}
                    onClick={() =>
                      void loadTeamScout(selectedSeason.season, selectedTeam.number, true)
                    }
                  >
                    Refresh analytics
                  </button>
                </div>
                {scoutMessage && (
                  <SourceStatusBlock
                    statusClass={`scout-status ${scoutStatus}`}
                    message={scoutMessage}
                    diagnostics={scoutDiagnostics}
                  />
                )}
              </section>

              {relatedTeams.length > 0 && selectedLineage && (
                <section className="lineage-panel">
                  <div className="section-heading">
                    <h3>Related Team Numbers</h3>
                    <span>{relatedTeams.length}</span>
                  </div>
                  <p className="lineage-note">
                    Likely the same school program under a different FTC team number when seasons do not overlap.
                  </p>
                  {selectedLineage.priorTeams.length > 0 && (
                    <div className="lineage-group">
                      <h4>Earlier team numbers</h4>
                      <div className="lineage-list">
                        {selectedLineage.priorTeams.map((link) => (
                          <button
                            key={`prior-${link.teamNumber}`}
                            type="button"
                            className="lineage-card"
                            onClick={() => setSelectedTeamNumber(link.teamNumber)}
                          >
                            <span className="lineage-card-top">
                              <strong>Team {link.teamNumber}</strong>
                              <span className={`lineage-confidence ${link.confidence}`}>{link.confidence}</span>
                            </span>
                            <span>{link.teamName}</span>
                            <small>
                              Seasons {link.seasonRange} - {link.matchReason}
                            </small>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedLineage.successorTeams.length > 0 && (
                    <div className="lineage-group">
                      <h4>Later team numbers</h4>
                      <div className="lineage-list">
                        {selectedLineage.successorTeams.map((link) => (
                          <button
                            key={`successor-${link.teamNumber}`}
                            type="button"
                            className="lineage-card"
                            onClick={() => setSelectedTeamNumber(link.teamNumber)}
                          >
                            <span className="lineage-card-top">
                              <strong>Team {link.teamNumber}</strong>
                              <span className={`lineage-confidence ${link.confidence}`}>{link.confidence}</span>
                            </span>
                            <span>{link.teamName}</span>
                            <small>
                              Seasons {link.seasonRange} - {link.matchReason}
                            </small>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {(selectedTeam.links?.length ?? 0) > 0 && (
                <section className="links-panel">
                  <div className="section-heading">
                    <h3>Useful Links</h3>
                    <span>{selectedTeam.links.length}</span>
                  </div>
                  <div className="link-grid">
                    {selectedTeam.links.map((link) => (
                      <a key={link.url} href={link.url} target="_blank" title={link.source}>
                        <strong>{link.label}</strong>
                        <span>{new URL(link.url).hostname.replace(/^www\./, '')}</span>
                      </a>
                    ))}
                  </div>
                </section>
              )}

              <section className="portfolio-panel">
                <div className="section-heading">
                  <h3>FTC Portfolio Lab</h3>
                  <span>{selectedPortfolios.length}</span>
                </div>
                {portfolioStatus === 'loading' && selectedPortfolios.length === 0 ? (
                  <p className="empty-note">Loading rated engineering portfolios...</p>
                ) : selectedPortfolios.length > 0 ? (
                  <div className="portfolio-grid">
                    {selectedPortfolios.map((portfolio) => {
                      const cover = portfolioCoverUrl(portfolio);

                      return (
                        <article key={portfolio.id} className="portfolio-card">
                          {cover && (
                            <img
                              className="portfolio-cover"
                              src={toPortfolioLabProxyUrl(portfolio.cover!)}
                              alt={`${portfolio.teamName} portfolio cover`}
                              loading="lazy"
                            />
                          )}
                          <div className="portfolio-body">
                            <p className="portfolio-season">{portfolio.season}</p>
                            <p className="portfolio-rating">
                              <span>{portfolio.stars}</span>
                              <span>{portfolio.score}</span>
                            </p>
                            <p className="portfolio-meta">
                              {portfolio.level} · {portfolio.award}
                            </p>
                            <p className="portfolio-summary">{portfolio.summary}</p>
                            <div className="portfolio-actions">
                              <a href={portfolio.pdf} target="_blank">
                                View PDF
                              </a>
                              <a href={portfolioLabSearchUrl(portfolio.teamNumber)} target="_blank">
                                Open in Portfolio Lab
                              </a>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : portfolioStatus === 'error' ? (
                  <p className="empty-note">
                    Portfolio Lab is temporarily unavailable, so rated portfolios cannot be shown right now.
                  </p>
                ) : (
                  <p className="empty-note">
                    No rated engineering portfolios are listed for this team on{' '}
                    <a href="https://www.ftcportfoliolab.org/portfolio" target="_blank">
                      FTC Portfolio Lab
                    </a>
                    .
                  </p>
                )}
                <div className="portfolio-toolbar">
                  <button
                    type="button"
                    disabled={portfolioStatus === 'loading'}
                    onClick={() => void refreshPortfolioCatalog(true)}
                  >
                    Refresh portfolios
                  </button>
                </div>
              </section>

              <div className="detail-columns">
                <section>
                  <div className="section-heading">
                    <h3>Meets & Events</h3>
                    <span>{selectedSeason.events?.length ?? 0}</span>
                  </div>
                  {(selectedSeason.events?.length ?? 0) > 0 ? (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Code</th>
                            <th>Event</th>
                            <th>Event Rank</th>
                            <th>Total Points</th>
                            <th>Ranking Score</th>
                            <th>League Rank</th>
                            <th>Playoff</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedSeason.events.map((event) => (
                            <tr key={eventKey(event)}>
                              <td>{event.code ?? '-'}</td>
                              <td>
                                {event.sourceUrl ? (
                                  <a href={event.sourceUrl} target="_blank">
                                    {event.name}
                                  </a>
                                ) : (
                                  event.name
                                )}
                              </td>
                              <td>{event.rank ?? '-'}</td>
                              <td>{event.totalPoints ?? '-'}</td>
                              <td>{event.rankingScore ?? '-'}</td>
                              <td>
                                {event.leagueSeasonRank && event.leagueSeasonRankTotal
                                  ? `${event.leagueSeasonRank} of ${event.leagueSeasonRankTotal}`
                                  : '-'}
                              </td>
                              <td>{event.playoffRecord ?? event.allianceSelection ?? '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="empty-note">Event rows have not been parsed for this team-season yet.</p>
                  )}
                </section>

                <section>
                  <div className="section-heading">
                    <h3>Awards</h3>
                    <span>{selectedSeason.awards?.length ?? 0}</span>
                  </div>
                  {(selectedSeason.awards?.length ?? 0) > 0 ? (
                    <ul className="award-list">
                      {selectedSeason.awards.map((award, index) => (
                        <li key={awardKey(award, index)}>
                          <strong>{award.name}</strong>
                          <span>
                            {award.awardType} - {award.eventName}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="empty-note">No awards are listed in the current generated data.</p>
                  )}
                </section>
              </div>

              {(selectedSeason.notes?.length ?? 0) > 0 && (
                <section className="notes">
                  <h3>Data Notes</h3>
                  {selectedSeason.notes.map((note) => (
                    <p key={note}>{note}</p>
                  ))}
                </section>
              )}
            </>
          ) : (
            <p className="empty-note">No team matches the current filters.</p>
          )}
        </section>
      </section>

      <footer>
        <div>
          <strong>Built by</strong>
          <a href="https://www.theallsparks.org/" target="_blank" rel="noreferrer">
            The Allsparks
          </a>
          <strong>Sources</strong>
          {data.sources.map((source) => (
            <a key={source.url} href={source.url} target="_blank" rel="noreferrer" title={source.note}>
              {source.label}
            </a>
          ))}
          <a
            href="https://www.ftcportfoliolab.org/portfolio"
            target="_blank"
            rel="noreferrer"
            title="Rated benchmark engineering portfolios and community PDF submissions."
          >
            FTC Portfolio Lab
          </a>
          <a
            href="https://ftcscout.org/api"
            target="_blank"
            rel="noreferrer"
            title="Community FTC statistics API used for OPR and event analytics."
          >
            FTCScout API
          </a>
        </div>
        <p>
          A public FTC explorer from{' '}
          <a href="https://www.theallsparks.org/" target="_blank" rel="noreferrer">
            The Allsparks
          </a>
          . {data.limitations.join(' ')} Portfolio Lab entries are loaded live from the public portfolio catalog and
          cached in the browser for 24 hours. FTCScout OPR and event analytics are cached per team-season for 30
          minutes to 7 days.
        </p>
      </footer>
    </main>
  );
}
