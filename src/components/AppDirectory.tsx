import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { portfolioMatchesSeason } from '../data/portfolioLab';
import {
  CURRENT_SEASON,
  GeneratedData,
  SeasonId,
  availableSeasons,
  isCurrentSeason,
  seasonOptions,
} from '../data/schema';
import { useFtcData } from '../hooks/useFtcData';
import { useFtcScout } from '../hooks/useFtcScout';
import { usePortfolioLab } from '../hooks/usePortfolioLab';
import { useTeamAvatarCatalog } from '../hooks/useTeamAvatarCatalog';
import { defaultSeasonWithData, initialSeasonFilter } from '../lib/ftcSeason';
import {
  buildSourceHealthReport,
  isDataHealthHash,
  LiveSourceSnapshot,
  readLastSeenTeamCount,
  writeLastSeenTeamCount,
} from '../lib/sourceHealthReport';
import {
  ALL_FILTER,
  ALL_SEASONS,
  SeasonFilter,
  advancementStatus,
  countAwards,
  countPortfolioMatches,
  countUniqueEvents,
  filterTeams,
  seasonMatchesCriteria,
  seasonsForFilter,
  seasonValues,
  uniqueSorted,
  visibleSeasonsForTeams,
} from '../lib/teamDirectory';
import { buildTeamLineageMap, getTeamLineage } from '../teamLineage';
import { DirectoryFilters } from './DirectoryFilters';
import { DirectoryFooter } from './DirectoryFooter';
import { DirectoryHero } from './DirectoryHero';
import { DirectoryStats } from './DirectoryStats';
import { TeamList } from './TeamList';

const TeamDetailPanel = lazy(() => import('./TeamDetailPanel'));
const SourceHealthDashboard = lazy(() =>
  import('./SourceHealthDashboard').then((module) => ({ default: module.SourceHealthDashboard })),
);

export function AppDirectory({ seedData }: { seedData: GeneratedData }) {
  const {
    data,
    regionCode,
    regionName,
    liveStatus,
    liveMessage,
    liveDiagnostics,
    liveProgress,
    seasonFallback,
    changeRegion,
    refreshRegion,
    refreshSeason,
    refreshTeam,
    ensureSeasonData,
  } = useFtcData(seedData);
  const {
    portfoliosByTeam,
    status: portfolioStatus,
    sourceState: portfolioSourceState,
    message: portfolioMessage,
    diagnostics: portfolioDiagnostics,
    refreshCatalog: refreshPortfolioCatalog,
  } = usePortfolioLab();
  const {
    getTeamScoutData,
    scoutStatus,
    scoutSourceState,
    scoutMessage,
    scoutDiagnostics,
    loadTeamScout,
  } = useFtcScout();
  const seasons = useMemo(() => seasonOptions(data), [data]);
  const ingestedSeasons = useMemo(() => availableSeasons(data), [data]);
  const defaultSeason = useMemo(() => defaultSeasonWithData(seasons, data.teams), [data.teams, seasons]);
  const teamLineageMap = useMemo(() => buildTeamLineageMap(data.teams), [data.teams]);
  const [showDataHealth, setShowDataHealth] = useState(
    () => typeof window !== 'undefined' && isDataHealthHash(window.location.hash),
  );
  const [lastSeenTeamCount, setLastSeenTeamCount] = useState<number | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [seasonFilter, setSeasonFilter] = useState<SeasonFilter>(() => initialSeasonFilter(seedData));
  const [leagueFilter, setLeagueFilter] = useState('all');
  const [cityFilters, setCityFilters] = useState<string[]>([]);
  const [rookieYearFilter, setRookieYearFilter] = useState('all');
  const [teamTypeFilter, setTeamTypeFilter] = useState('all');
  const [advancementFilter, setAdvancementFilter] = useState('all');
  const [awardTypeFilter, setAwardTypeFilter] = useState('all');
  const [awardsOnly, setAwardsOnly] = useState(false);
  const [portfoliosOnly, setPortfoliosOnly] = useState(false);
  const [selectedTeamNumber, setSelectedTeamNumber] = useState<number | null>(data.teams[0]?.number ?? null);
  const [detailSeason, setDetailSeason] = useState<SeasonId | null>(() => initialSeasonFilter(seedData));
  const lastTeamRefreshKey = useRef<string | null>(null);
  const lastScoutRefreshKey = useRef<string | null>(null);

  useEffect(() => {
    if (!seasonFallback) {
      return;
    }
    setSeasonFilter(seasonFallback.activeSeason);
    setDetailSeason(seasonFallback.activeSeason);
  }, [seasonFallback]);

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

  const filteredTeams = useMemo(
    () =>
      filterTeams(data.teams, {
        seasonFilter,
        query,
        criteria: {
          leagueFilter,
          cityFilters,
          rookieYearFilter,
          teamTypeFilter,
          advancementFilter,
          awardTypeFilter,
          awardsOnly,
          regionCode,
        },
        portfoliosOnly,
        portfoliosByTeam,
      }),
    [
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
    ],
  );

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
    sourceState: avatarSourceState,
    message: avatarMessage,
    diagnostics: avatarDiagnostics,
  } = useTeamAvatarCatalog(avatarSeason);

  useEffect(() => {
    const onHashChange = () => {
      setShowDataHealth(isDataHealthHash(window.location.hash));
    };

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const storage = typeof window !== 'undefined' ? window.localStorage : null;
    const previous = readLastSeenTeamCount(storage);
    setLastSeenTeamCount(previous.count);
    setLastSeenAt(previous.seenAt);
    writeLastSeenTeamCount(data.teams.length, storage);
  }, [data.generatedAt, data.teams.length]);

  const liveSources = useMemo<LiveSourceSnapshot[]>(
    () => [
      {
        id: 'ftc-events',
        label: 'FTC Events (session)',
        sessionStatus: liveStatus === 'refreshing' ? 'refreshing' : liveStatus === 'error' ? 'error' : 'idle',
        sourceState: null,
        message: liveMessage,
        diagnostics: liveDiagnostics,
      },
      {
        id: 'ftcscout',
        label: 'FTCScout (session)',
        sessionStatus: scoutStatus === 'loading' ? 'loading' : scoutStatus,
        sourceState: scoutSourceState,
        message: scoutMessage,
        diagnostics: scoutDiagnostics,
      },
      {
        id: 'portfolio-lab',
        label: 'Portfolio Lab (session)',
        sessionStatus: portfolioStatus === 'loading' ? 'loading' : portfolioStatus,
        sourceState: portfolioSourceState,
        message: portfolioMessage,
        diagnostics: portfolioDiagnostics,
      },
      {
        id: 'team-avatars',
        label: 'Team avatars (session)',
        sessionStatus: avatarStatus === 'loading' ? 'loading' : avatarStatus,
        sourceState: avatarSourceState,
        message: avatarMessage,
        diagnostics: avatarDiagnostics,
      },
    ],
    [
      avatarDiagnostics,
      avatarMessage,
      avatarSourceState,
      avatarStatus,
      liveDiagnostics,
      liveMessage,
      liveStatus,
      portfolioDiagnostics,
      portfolioMessage,
      portfolioSourceState,
      portfolioStatus,
      scoutDiagnostics,
      scoutMessage,
      scoutSourceState,
      scoutStatus,
    ],
  );

  const sourceHealthReport = useMemo(
    () =>
      buildSourceHealthReport(data, {
        liveSources,
        lastSeenTeamCount,
        lastSeenAt,
      }),
    [data, lastSeenAt, lastSeenTeamCount, liveSources],
  );

  const closeDataHealth = () => {
    if (typeof window === 'undefined') {
      setShowDataHealth(false);
      return;
    }

    const nextUrl = `${window.location.pathname}${window.location.search}`;
    window.history.pushState(null, '', nextUrl);
    setShowDataHealth(false);
  };
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
  const selectedScoutData =
    selectedTeam && selectedSeason ? getTeamScoutData(selectedSeason.season, selectedTeam.number) : null;

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
    () => visibleSeasonsForTeams(filteredTeams, seasonFilter),
    [filteredTeams, seasonFilter],
  );
  const eventCount = countUniqueEvents(visibleSeasonValues);
  const awardCount = countAwards(visibleSeasonValues);
  const portfolioCount = countPortfolioMatches(filteredTeams, seasonFilter, portfoliosByTeam);
  const activeSeasonCount = visibleSeasonValues.length;

  if (showDataHealth) {
    return (
      <main className="app-shell">
        <Suspense
          fallback={
            <section className="source-health" aria-label="Data health dashboard">
              <p className="empty-note">Loading data health…</p>
            </section>
          }
        >
          <SourceHealthDashboard report={sourceHealthReport} onBack={closeDataHealth} />
        </Suspense>
        <DirectoryFooter data={data} />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <DirectoryHero
        regionName={regionName}
        regionCode={regionCode}
        data={data}
        defaultSeason={defaultSeason}
        seasonFilter={seasonFilter}
        liveStatus={liveStatus}
        liveMessage={liveMessage}
        liveDiagnostics={liveDiagnostics}
        liveProgress={liveProgress}
        seasonFallback={seasonFallback}
        refreshRegion={refreshRegion}
        refreshSeason={refreshSeason}
        portfolioStatus={portfolioStatus}
        portfolioMessage={portfolioMessage}
        portfolioDiagnostics={portfolioDiagnostics}
        avatarStatus={avatarStatus}
        avatarMessage={avatarMessage}
        avatarDiagnostics={avatarDiagnostics}
      />

      <DirectoryStats
        teamCount={filteredTeams.length}
        activeSeasonCount={activeSeasonCount}
        eventCount={eventCount}
        awardCount={awardCount}
        portfolioCount={portfolioCount}
      />

      <DirectoryFilters
        regionCode={regionCode}
        liveStatus={liveStatus}
        changeRegion={changeRegion}
        query={query}
        setQuery={setQuery}
        seasonFilter={seasonFilter}
        setSeasonFilter={setSeasonFilter}
        seasons={seasons}
        currentSeason={CURRENT_SEASON}
        availableSeasons={ingestedSeasons}
        unpublishedCurrent={
          Boolean(seasonFallback && isCurrentSeason(seasonFallback.requestedSeason))
        }
        leagueFilter={leagueFilter}
        setLeagueFilter={setLeagueFilter}
        leagues={leagues}
        cityFilters={cityFilters}
        setCityFilters={setCityFilters}
        cities={cities}
        rookieYearFilter={rookieYearFilter}
        setRookieYearFilter={setRookieYearFilter}
        rookieYears={rookieYears}
        teamTypeFilter={teamTypeFilter}
        setTeamTypeFilter={setTeamTypeFilter}
        teamTypes={teamTypes}
        advancementFilter={advancementFilter}
        setAdvancementFilter={setAdvancementFilter}
        advancementStatuses={advancementStatuses}
        awardTypeFilter={awardTypeFilter}
        setAwardTypeFilter={setAwardTypeFilter}
        awardTypes={awardTypes}
        awardsOnly={awardsOnly}
        setAwardsOnly={setAwardsOnly}
        portfoliosOnly={portfoliosOnly}
        setPortfoliosOnly={setPortfoliosOnly}
      />

      <section className="workspace">
        <TeamList
          teams={filteredTeams}
          selectedTeamNumber={selectedTeam?.number ?? null}
          seasonFilter={seasonFilter}
          portfoliosByTeam={portfoliosByTeam}
          getAvatarUrl={getAvatarUrl}
          onSelectTeam={setSelectedTeamNumber}
        />

        <Suspense
          fallback={
            <section className="detail-panel" aria-label="Team details">
              <p className="empty-note">Loading team details…</p>
            </section>
          }
        >
          <TeamDetailPanel
            selectedTeam={selectedTeam}
            selectedSeason={selectedSeason}
            selectedSeasons={selectedSeasons}
            regionCode={regionCode}
            regionEvents={data.regionEvents}
            getAvatarUrl={getAvatarUrl}
            liveStatus={liveStatus}
            refreshTeam={refreshTeam}
            setDetailSeason={setDetailSeason}
            setSelectedTeamNumber={setSelectedTeamNumber}
            selectedScoutData={selectedScoutData}
            scoutStatus={scoutStatus}
            scoutMessage={scoutMessage}
            scoutDiagnostics={scoutDiagnostics}
            loadTeamScout={loadTeamScout}
            selectedLineage={selectedLineage}
            selectedPortfolios={selectedPortfolios}
            portfolioStatus={portfolioStatus}
            refreshPortfolioCatalog={refreshPortfolioCatalog}
          />
        </Suspense>
      </section>

      <DirectoryFooter data={data} />
    </main>
  );
}
