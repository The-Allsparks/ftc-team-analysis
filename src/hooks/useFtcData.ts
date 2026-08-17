import { useCallback, useEffect, useRef, useState } from 'react';
import { loadRegionSeasonSummary, loadTeamSeasonDetail, loadTeamSnapshotIndex } from '../data/loadSnapshotAssets';
import { loadStoredRegionCode, regionLabel, storeRegionCode } from '../data/regions';
import { CURRENT_SEASON, GeneratedData, SeasonId, Team } from '../data/schema';
import {
  isTeamSeasonDetailLoaded,
  mergeRegionSummaryIntoData,
  mergeTeamSeasonDetail,
} from '../data/snapshotDirectory';
import {
  createEmptyRegionData,
  LiveRefreshProgress,
  LiveRefreshStatus,
  refreshRegionSeason,
  refreshSeasonDetails,
  refreshTeamAllSeasonsLive,
  refreshTeamSeasonLive,
  seasonHasTeamData,
  shouldAutoRefreshRegion,
} from '../lib/ftcLive';
import { resolvePublishedRegionSeason } from '../lib/ftcSeason';
import { failureFromUnknown } from '../lib/sourceResult';
import { refreshLatestFields } from '../lib/ftcParsers';

export type SeasonFallbackState = {
  requestedSeason: SeasonId;
  activeSeason: SeasonId;
};

type UseFtcDataResult = {
  data: GeneratedData;
  regionCode: string;
  regionName: string;
  liveStatus: LiveRefreshStatus;
  liveMessage: string | null;
  liveDiagnostics: string | null;
  liveProgress: LiveRefreshProgress | null;
  /** Persistent when current (or requested) season is unpublished and a prior season is shown. */
  seasonFallback: SeasonFallbackState | null;
  changeRegion: (regionCode: string) => Promise<void>;
  refreshRegion: (season: SeasonId, force?: boolean) => Promise<void>;
  refreshSeason: (season: SeasonId, force?: boolean) => Promise<void>;
  refreshTeam: (season: SeasonId, teamNumber: number, force?: boolean) => Promise<void>;
  ensureSeasonData: (season: SeasonId) => Promise<void>;
  /** Load static team-season JSON when the directory only has a summary stub. */
  ensureTeamSeasonDetail: (season: SeasonId, teamNumber: number) => Promise<void>;
  clearSeasonFallback: () => void;
};

function preferredSeason(): SeasonId {
  return CURRENT_SEASON;
}

function dataForRegion(seedData: GeneratedData, regionCode: string): GeneratedData {
  if (regionCode === seedData.regionCode) {
    return {
      ...seedData,
      regionLabel: seedData.regionLabel ?? regionLabel(regionCode),
    };
  }

  return createEmptyRegionData(regionCode);
}

function fallbackFromResolved(resolved: {
  usedFallback: boolean;
  requestedSeason: SeasonId;
  season: SeasonId;
}): SeasonFallbackState | null {
  if (!resolved.usedFallback) {
    return null;
  }
  return {
    requestedSeason: resolved.requestedSeason,
    activeSeason: resolved.season,
  };
}

function indexFieldsFromSnapshot(index: {
  latestName: string;
  latestLocation: string;
  latestCity: string | null;
  latestState: string | null;
  latestCountry: string | null;
  latestRookieYear: number | null;
  latestOrganization: string | null;
  latestWebsite: string | null;
  latestTeamType: Team['latestTeamType'];
  latestLeague: string | null;
  latestRegion: string | null;
  links?: Team['links'];
  codeRepositories?: Team['codeRepositories'];
  videoResources?: Team['videoResources'];
}): Partial<Team> {
  return {
    latestName: index.latestName,
    latestLocation: index.latestLocation,
    latestCity: index.latestCity,
    latestState: index.latestState,
    latestCountry: index.latestCountry,
    latestRookieYear: index.latestRookieYear,
    latestOrganization: index.latestOrganization,
    latestWebsite: index.latestWebsite,
    latestTeamType: index.latestTeamType,
    latestLeague: index.latestLeague,
    latestRegion: index.latestRegion,
    ...(index.links ? { links: index.links } : {}),
    ...(index.codeRepositories ? { codeRepositories: index.codeRepositories } : {}),
    ...(index.videoResources ? { videoResources: index.videoResources } : {}),
  };
}

export function useFtcData(seedData: GeneratedData): UseFtcDataResult {
  const [regionCode, setRegionCode] = useState(() => loadStoredRegionCode(seedData.regionCode));
  const [data, setData] = useState(() => dataForRegion(seedData, loadStoredRegionCode(seedData.regionCode)));
  const [liveStatus, setLiveStatus] = useState<LiveRefreshStatus>('idle');
  const [liveMessage, setLiveMessage] = useState<string | null>(null);
  const [liveDiagnostics, setLiveDiagnostics] = useState<string | null>(null);
  const [liveProgress, setLiveProgress] = useState<LiveRefreshProgress | null>(null);
  const [seasonFallback, setSeasonFallback] = useState<SeasonFallbackState | null>(null);
  const dataRef = useRef(data);
  const regionRef = useRef(regionCode);
  const seedRegionRef = useRef(seedData.regionCode);
  const autoPullKeysRef = useRef(new Set<string>());
  const detailLoadKeysRef = useRef(new Set<string>());
  dataRef.current = data;
  regionRef.current = regionCode;
  seedRegionRef.current = seedData.regionCode;

  const clearSeasonFallback = useCallback(() => {
    setSeasonFallback(null);
  }, []);

  const refreshRegion = useCallback(async (season: SeasonId, force = false, replace = false) => {
    setLiveStatus('refreshing');
    setLiveMessage(`Refreshing ${season} roster for ${regionLabel(regionRef.current)}...`);
    setLiveDiagnostics(null);
    setLiveProgress(null);

    try {
      const resolved = await resolvePublishedRegionSeason(regionRef.current, season, dataRef.current);
      setSeasonFallback(fallbackFromResolved(resolved));

      if (resolved.usedFallback) {
        setLiveMessage(
          `Season ${resolved.requestedSeason} is not published on FTC Events yet; refreshing ${resolved.season} roster for ${regionLabel(regionRef.current)}...`,
        );
      }

      const result = await refreshRegionSeason(
        { ...dataRef.current, regionCode: regionRef.current },
        resolved.season,
        { force, replace },
      );
      setData((current) => ({
        ...current,
        regionCode: regionRef.current,
        regionLabel: result.regionLabel,
        liveRefreshedAt: new Date().toISOString(),
        teams: result.teams,
        regionEvents: result.regionEvents,
      }));
      setLiveStatus('idle');
      setLiveMessage(
        resolved.usedFallback
          ? `Updated ${resolved.season} roster for ${result.regionLabel}. (${resolved.requestedSeason} is not published yet.)`
          : `Updated ${resolved.season} roster for ${result.regionLabel}.`,
      );
      setLiveDiagnostics(null);
    } catch (error) {
      const failure = failureFromUnknown(error, 'FTC Events');
      setLiveStatus('error');
      setLiveMessage(failure.userMessage);
      setLiveDiagnostics(failure.diagnostics);
    } finally {
      setLiveProgress(null);
    }
  }, []);

  const refreshSeason = useCallback(async (season: SeasonId, force = false, replace = false) => {
    setLiveStatus('refreshing');
    setLiveMessage(`Pulling ${season} data for ${regionLabel(regionRef.current)}...`);
    setLiveDiagnostics(null);
    setLiveProgress({ label: 'Starting season refresh', completed: 0, total: 1 });

    try {
      const resolved = await resolvePublishedRegionSeason(regionRef.current, season, dataRef.current);
      setSeasonFallback(fallbackFromResolved(resolved));

      if (resolved.usedFallback) {
        setLiveMessage(
          `Season ${resolved.requestedSeason} is not published on FTC Events yet; pulling ${resolved.season} data for ${regionLabel(regionRef.current)}...`,
        );
      }

      const refreshed = await refreshSeasonDetails(
        { ...dataRef.current, regionCode: regionRef.current },
        resolved.season,
        (progress) => setLiveProgress(progress),
        { force, replace },
      );
      setData({ ...refreshed, regionCode: regionRef.current });
      setLiveStatus('idle');
      setLiveMessage(
        resolved.usedFallback
          ? `Pulled ${resolved.season} data for ${refreshed.regionLabel ?? regionLabel(regionRef.current)}. (${resolved.requestedSeason} is not published yet.)`
          : `Pulled ${resolved.season} data for ${refreshed.regionLabel ?? regionLabel(regionRef.current)}.`,
      );
      setLiveDiagnostics(null);
    } catch (error) {
      const failure = failureFromUnknown(error, 'FTC Events');
      setLiveStatus('error');
      setLiveMessage(failure.userMessage);
      setLiveDiagnostics(failure.diagnostics);
    } finally {
      setLiveProgress(null);
    }
  }, []);

  const ensureSeasonData = useCallback(
    async (season: SeasonId) => {
      const key = `${regionRef.current}:${season}`;
      if (seasonHasTeamData(dataRef.current, season)) {
        return;
      }
      if (autoPullKeysRef.current.has(key)) {
        return;
      }

      autoPullKeysRef.current.add(key);
      try {
        // Static-first: try region summary before live proxy when on the seeded region.
        if (regionRef.current === seedRegionRef.current) {
          const summary = await loadRegionSeasonSummary(regionRef.current, season);
          if (summary.ok && summary.data.teamCount > 0) {
            setData((current) => {
              const next = mergeRegionSummaryIntoData(current, summary.data);
              dataRef.current = next;
              return next;
            });
            return;
          }
        }

        await refreshSeason(season, true, false);
      } catch {
        autoPullKeysRef.current.delete(key);
      }
    },
    [refreshSeason],
  );

  const refreshTeam = useCallback(async (season: SeasonId, teamNumber: number, force = false) => {
    setLiveStatus('refreshing');
    setLiveMessage(
      force ? `Refreshing all seasons for team ${teamNumber}...` : `Refreshing team ${teamNumber} (${season})...`,
    );
    setLiveDiagnostics(null);
    setLiveProgress(force ? { label: `Checking seasons for team ${teamNumber}`, completed: 0, total: 1 } : null);

    try {
      const context = { ...dataRef.current, regionCode: regionRef.current };

      if (force) {
        const seasonDataList = await refreshTeamAllSeasonsLive(context, teamNumber, (progress) => setLiveProgress(progress), {
          force,
        });
        const seasonsById = Object.fromEntries(seasonDataList.map((seasonData) => [seasonData.season, seasonData]));

        setData((current) => ({
          ...current,
          liveRefreshedAt: new Date().toISOString(),
          teams: current.teams
            .map((team) => {
              if (team.number !== teamNumber) {
                return team;
              }

              return refreshLatestFields({
                ...team,
                seasons: {
                  ...team.seasons,
                  ...seasonsById,
                },
              });
            })
            .sort((a, b) => a.number - b.number),
        }));
        setLiveStatus('idle');
        setLiveMessage(
          seasonDataList.length > 0
            ? `Updated team ${teamNumber} across ${seasonDataList.length} season${seasonDataList.length === 1 ? '' : 's'}.`
            : `No public FTC Events pages were found for team ${teamNumber}.`,
        );
        return;
      }

      const seasonData = await refreshTeamSeasonLive(context, season, teamNumber, { force });
      setData((current) => ({
        ...current,
        liveRefreshedAt: new Date().toISOString(),
        teams: current.teams
          .map((team) => {
            if (team.number !== teamNumber) {
              return team;
            }

            return refreshLatestFields({
              ...team,
              seasons: {
                ...team.seasons,
                [season]: seasonData,
              },
            });
          })
          .sort((a, b) => a.number - b.number),
      }));

      if (seasonData.liveSource && !seasonData.liveSource.ok) {
        setLiveStatus('error');
        setLiveMessage(seasonData.liveSource.userMessage ?? 'Could not refresh the live FTC Events page.');
        setLiveDiagnostics(seasonData.liveSource.diagnostics ?? null);
      } else {
        setLiveStatus('idle');
        setLiveMessage(`Updated team ${teamNumber} for ${season}.`);
        setLiveDiagnostics(null);
      }
    } catch (error) {
      const failure = failureFromUnknown(error, 'FTC Events');
      setLiveStatus('error');
      setLiveMessage(failure.userMessage);
      setLiveDiagnostics(failure.diagnostics);
    } finally {
      setLiveProgress(null);
    }
  }, []);

  const ensureTeamSeasonDetail = useCallback(
    async (season: SeasonId, teamNumber: number) => {
      const team = dataRef.current.teams.find((row) => row.number === teamNumber);
      if (isTeamSeasonDetailLoaded(team, season)) {
        return;
      }

      const key = `${teamNumber}:${season}`;
      if (detailLoadKeysRef.current.has(key)) {
        return;
      }
      detailLoadKeysRef.current.add(key);

      try {
        const detail = await loadTeamSeasonDetail(teamNumber, season);
        if (detail.ok) {
          const index = await loadTeamSnapshotIndex(teamNumber);
          const indexLatest = index.ok ? indexFieldsFromSnapshot(index.data) : undefined;
          setData((current) => {
            const next = mergeTeamSeasonDetail(current, teamNumber, detail.data, indexLatest);
            dataRef.current = next;
            return next;
          });
          return;
        }

        // Snapshot missing/invalid — live proxy only when static detail is unavailable.
        await refreshTeam(season, teamNumber, false);
      } finally {
        detailLoadKeysRef.current.delete(key);
      }
    },
    [refreshTeam],
  );

  const changeRegion = useCallback(
    async (nextRegionCode: string) => {
      if (nextRegionCode === regionRef.current) {
        return;
      }

      storeRegionCode(nextRegionCode);
      setRegionCode(nextRegionCode);
      regionRef.current = nextRegionCode;
      autoPullKeysRef.current.clear();
      detailLoadKeysRef.current.clear();
      setSeasonFallback(null);

      const shell = {
        ...dataForRegion(seedData, nextRegionCode),
        regionCode: nextRegionCode,
      };
      const replace = nextRegionCode !== seedData.regionCode;
      const season = preferredSeason();

      setData(shell);
      dataRef.current = shell;

      await refreshSeason(season, true, replace);
      autoPullKeysRef.current.add(`${nextRegionCode}:${season}`);
    },
    [refreshSeason, seedData],
  );

  useEffect(() => {
    const storedRegion = loadStoredRegionCode(seedData.regionCode);
    const season = preferredSeason();
    const shell = { ...dataForRegion(seedData, storedRegion), regionCode: storedRegion };
    const key = `${storedRegion}:${season}`;

    if (!shouldAutoRefreshRegion(season, shell)) {
      return;
    }

    if (autoPullKeysRef.current.has(key)) {
      return;
    }

    autoPullKeysRef.current.add(key);
    dataRef.current = shell;
    const force = !seasonHasTeamData(shell, season);
    void refreshSeason(season, force, storedRegion !== seedData.regionCode).catch(() => {
      autoPullKeysRef.current.delete(key);
    });
  }, [refreshSeason, seedData]);

  return {
    data,
    regionCode,
    regionName: data.regionLabel ?? regionLabel(regionCode),
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
    ensureTeamSeasonDetail,
    clearSeasonFallback,
  };
}
