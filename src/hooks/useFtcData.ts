import { useCallback, useEffect, useRef, useState } from 'react';
import { loadStoredRegionCode, regionLabel, storeRegionCode } from '../data/regions';
import { GeneratedData, SeasonId, TARGET_SEASONS } from '../data/schema';
import {
  createEmptyRegionData,
  LiveRefreshProgress,
  LiveRefreshStatus,
  refreshRegionSeason,
  refreshSeasonDetails,
  refreshTeamAllSeasonsLive,
  refreshTeamSeasonLive,
  shouldAutoRefreshRegion,
} from '../lib/ftcLive';
import { defaultSeasonWithData, resolvePublishedRegionSeason } from '../lib/ftcSeason';
import { refreshLatestFields } from '../lib/ftcParsers';

type UseFtcDataResult = {
  data: GeneratedData;
  regionCode: string;
  regionName: string;
  liveStatus: LiveRefreshStatus;
  liveMessage: string | null;
  liveProgress: LiveRefreshProgress | null;
  changeRegion: (regionCode: string) => Promise<void>;
  refreshRegion: (season: SeasonId, force?: boolean) => Promise<void>;
  refreshSeason: (season: SeasonId, force?: boolean) => Promise<void>;
  refreshTeam: (season: SeasonId, teamNumber: number, force?: boolean) => Promise<void>;
};

function latestSeason(data: GeneratedData): SeasonId {
  return data.targetSeasons[0] ?? TARGET_SEASONS[0];
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

export function useFtcData(seedData: GeneratedData): UseFtcDataResult {
  const [regionCode, setRegionCode] = useState(() => loadStoredRegionCode(seedData.regionCode));
  const [data, setData] = useState(() => dataForRegion(seedData, loadStoredRegionCode(seedData.regionCode)));
  const [liveStatus, setLiveStatus] = useState<LiveRefreshStatus>('idle');
  const [liveMessage, setLiveMessage] = useState<string | null>(null);
  const [liveProgress, setLiveProgress] = useState<LiveRefreshProgress | null>(null);
  const dataRef = useRef(data);
  const regionRef = useRef(regionCode);
  dataRef.current = data;
  regionRef.current = regionCode;

  const refreshRegion = useCallback(async (season: SeasonId, force = false, replace = false) => {
    setLiveStatus('refreshing');
    setLiveMessage(`Refreshing ${season} roster for ${regionLabel(regionRef.current)}...`);
    setLiveProgress(null);

    try {
      const resolved = await resolvePublishedRegionSeason(regionRef.current, season);

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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLiveStatus('error');
      setLiveMessage(`Live refresh failed: ${message}`);
    } finally {
      setLiveProgress(null);
    }
  }, []);

  const refreshSeason = useCallback(async (season: SeasonId, force = false, replace = false) => {
      setLiveStatus('refreshing');
      setLiveMessage(`Pulling ${season} data for ${regionLabel(regionRef.current)}...`);
    setLiveProgress({ label: 'Starting season refresh', completed: 0, total: 1 });

    try {
      const resolved = await resolvePublishedRegionSeason(regionRef.current, season);

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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLiveStatus('error');
      setLiveMessage(`Season refresh failed: ${message}`);
    } finally {
      setLiveProgress(null);
    }
  }, []);

  const refreshTeam = useCallback(async (season: SeasonId, teamNumber: number, force = false) => {
    setLiveStatus('refreshing');
    setLiveMessage(
      force ? `Refreshing all seasons for team ${teamNumber}...` : `Refreshing team ${teamNumber} (${season})...`,
    );
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
      setLiveStatus('idle');
      setLiveMessage(`Updated team ${teamNumber} for ${season}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLiveStatus('error');
      setLiveMessage(`Team refresh failed: ${message}`);
    } finally {
      setLiveProgress(null);
    }
  }, []);

  const changeRegion = useCallback(
    async (nextRegionCode: string) => {
      if (nextRegionCode === regionRef.current) {
        return;
      }

      storeRegionCode(nextRegionCode);
      setRegionCode(nextRegionCode);
      regionRef.current = nextRegionCode;

      const shell = {
        ...dataForRegion(seedData, nextRegionCode),
        regionCode: nextRegionCode,
      };
      const replace = nextRegionCode !== seedData.regionCode;
      const season = latestSeason(shell);

      setData(shell);
      dataRef.current = shell;

      await refreshSeason(season, true, replace);
    },
    [refreshSeason, seedData],
  );

  useEffect(() => {
    const storedRegion = loadStoredRegionCode(seedData.regionCode);
    const season = latestSeason(dataForRegion(seedData, storedRegion));
    const shell = { ...dataForRegion(seedData, storedRegion), regionCode: storedRegion };

    if (!shouldAutoRefreshRegion(season, shell)) {
      return;
    }

    dataRef.current = shell;
    void refreshSeason(season, false, storedRegion !== seedData.regionCode);
  }, [refreshSeason, seedData]);

  return {
    data,
    regionCode,
    regionName: data.regionLabel ?? regionLabel(regionCode),
    liveStatus,
    liveMessage,
    liveProgress,
    changeRegion,
    refreshRegion,
    refreshSeason,
    refreshTeam,
  };
}
