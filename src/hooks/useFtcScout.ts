import { useCallback, useRef, useState } from 'react';
import { TeamScoutData } from '../data/ftcScout';
import { SeasonId } from '../data/schema';
import { fetchTeamScoutData } from '../lib/ftcScout';

type ScoutStatus = 'idle' | 'loading' | 'ready' | 'error';

type UseFtcScoutResult = {
  getTeamScoutData: (season: SeasonId, teamNumber: number) => TeamScoutData | null;
  scoutStatus: ScoutStatus;
  scoutMessage: string | null;
  loadTeamScout: (season: SeasonId, teamNumber: number, force?: boolean) => Promise<TeamScoutData | null>;
};

function scoutStateKey(season: SeasonId, teamNumber: number): string {
  return `${teamNumber}:${season}`;
}

export function useFtcScout(): UseFtcScoutResult {
  const [scoutData, setScoutData] = useState<Record<string, TeamScoutData>>({});
  const [scoutStatus, setScoutStatus] = useState<ScoutStatus>('idle');
  const [scoutMessage, setScoutMessage] = useState<string | null>(null);
  const inFlight = useRef<Set<string>>(new Set());

  const getTeamScoutData = useCallback(
    (season: SeasonId, teamNumber: number) => scoutData[scoutStateKey(season, teamNumber)] ?? null,
    [scoutData],
  );

  const loadTeamScout = useCallback(async (season: SeasonId, teamNumber: number, force = false) => {
    const key = scoutStateKey(season, teamNumber);

    if (!force && scoutData[key]) {
      return scoutData[key];
    }

    if (inFlight.current.has(key)) {
      return scoutData[key] ?? null;
    }

    inFlight.current.add(key);
    setScoutStatus('loading');
    setScoutMessage(`Loading FTCScout stats for team ${teamNumber} (${season})...`);

    try {
      const data = await fetchTeamScoutData(season, teamNumber, { force });
      setScoutData((current) => ({
        ...current,
        [key]: data,
      }));
      setScoutStatus('ready');
      setScoutMessage(
        data.quickStats
          ? `Loaded FTCScout season stats for team ${teamNumber}.`
          : `FTCScout has limited stats for team ${teamNumber} in ${season}.`,
      );
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setScoutStatus('error');
      setScoutMessage(`FTCScout load failed: ${message}`);
      return null;
    } finally {
      inFlight.current.delete(key);
    }
  }, [scoutData]);

  return {
    getTeamScoutData,
    scoutStatus,
    scoutMessage,
    loadTeamScout,
  };
}
