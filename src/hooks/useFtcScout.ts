import { useCallback, useRef, useState } from 'react';
import { TeamScoutData } from '../data/ftcScout';
import { SeasonId } from '../data/schema';
import { fetchTeamScoutData } from '../lib/ftcScout';
import { SourceState, userMessageFor } from '../lib/sourceResult';

type ScoutStatus = 'idle' | 'loading' | 'ready' | 'error';

type UseFtcScoutResult = {
  getTeamScoutData: (season: SeasonId, teamNumber: number) => TeamScoutData | null;
  scoutStatus: ScoutStatus;
  scoutSourceState: SourceState | null;
  scoutMessage: string | null;
  scoutDiagnostics: string | null;
  loadTeamScout: (season: SeasonId, teamNumber: number, force?: boolean) => Promise<TeamScoutData | null>;
};

function scoutStateKey(season: SeasonId, teamNumber: number): string {
  return `${teamNumber}:${season}`;
}

export function useFtcScout(): UseFtcScoutResult {
  const [scoutData, setScoutData] = useState<Record<string, TeamScoutData>>({});
  const [scoutStatus, setScoutStatus] = useState<ScoutStatus>('idle');
  const [scoutSourceState, setScoutSourceState] = useState<SourceState | null>(null);
  const [scoutMessage, setScoutMessage] = useState<string | null>(null);
  const [scoutDiagnostics, setScoutDiagnostics] = useState<string | null>(null);
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
    setScoutSourceState(null);
    setScoutDiagnostics(null);
    setScoutMessage(`Loading FTCScout stats for team ${teamNumber} (${season})...`);

    try {
      const result = await fetchTeamScoutData(season, teamNumber, { force });

      if (result.data) {
        setScoutData((current) => ({
          ...current,
          [key]: result.data!,
        }));
      }

      setScoutSourceState(result.state);
      setScoutDiagnostics(result.diagnostics ?? null);

      if (result.ok) {
        setScoutStatus('ready');
        setScoutMessage(
          result.state === 'no_record'
            ? userMessageFor('no_record', 'FTCScout')
            : result.data?.quickStats
              ? `Loaded FTCScout season stats for team ${teamNumber}.`
              : `FTCScout has limited stats for team ${teamNumber} in ${season}.`,
        );
        return result.data;
      }

      setScoutStatus('error');
      setScoutMessage(result.userMessage);
      return result.data ?? null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setScoutStatus('error');
      setScoutSourceState('upstream_unavailable');
      setScoutMessage(`FTCScout load failed.`);
      setScoutDiagnostics(message);
      return null;
    } finally {
      inFlight.current.delete(key);
    }
  }, [scoutData]);

  return {
    getTeamScoutData,
    scoutStatus,
    scoutSourceState,
    scoutMessage,
    scoutDiagnostics,
    loadTeamScout,
  };
}
