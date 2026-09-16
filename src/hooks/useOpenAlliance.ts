import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchOpenAllianceFtcTeamListViaProxy,
  parseOpenAllianceTeamNumber,
  type OpenAllianceFtcTeam,
} from '../lib/openAlliance';
import type { SourceState } from '../lib/sourceResult';

type OpenAllianceStatus = 'idle' | 'loading' | 'ready' | 'error';

type UseOpenAllianceResult = {
  listings: OpenAllianceFtcTeam[];
  getListing: (teamNumber: number) => OpenAllianceFtcTeam | null;
  fetchedAt: string | null;
  status: OpenAllianceStatus;
  sourceState: SourceState | null;
  refreshListings: (force?: boolean) => Promise<void>;
};

export function useOpenAlliance(): UseOpenAllianceResult {
  const [listings, setListings] = useState<OpenAllianceFtcTeam[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<OpenAllianceStatus>('idle');
  const [sourceState, setSourceState] = useState<SourceState | null>(null);

  const refreshListings = useCallback(async (force = false) => {
    if (!force && listings.length > 0) {
      return;
    }
    setStatus('loading');
    setSourceState(null);
    try {
      const result = await fetchOpenAllianceFtcTeamListViaProxy();
      setListings(result.listings);
      setFetchedAt(new Date().toISOString());
      setStatus('ready');
      setSourceState(result.listings.length > 0 ? 'available' : 'no_record');
    } catch {
      setStatus('error');
      setSourceState('upstream_unavailable');
    }
  }, [listings.length]);

  useEffect(() => {
    void refreshListings();
  }, [refreshListings]);

  const byNumber = useMemo(() => {
    const map = new Map<number, OpenAllianceFtcTeam>();
    for (const listing of listings) {
      const number = parseOpenAllianceTeamNumber(listing.TeamNumber);
      if (number != null) {
        map.set(number, listing);
      }
    }
    return map;
  }, [listings]);

  const getListing = useCallback(
    (teamNumber: number) => byNumber.get(teamNumber) ?? null,
    [byNumber],
  );

  return {
    listings,
    getListing,
    fetchedAt,
    status,
    sourceState,
    refreshListings,
  };
}
