import { useCallback, useRef, useState } from 'react';
import type { SeasonId } from '../data/schema';
import {
  fetchFirstApiTeamFromProxy,
  type FirstApiTeam,
} from '../lib/firstEventsApi';

export type FirstApiTeamListing = {
  team: FirstApiTeam;
  season: SeasonId;
  retrievedAt: string;
};

function listingKey(season: SeasonId, teamNumber: number): string {
  return `${teamNumber}:${season}`;
}

type UseFirstApiTeamResult = {
  getFirstApiTeam: (season: SeasonId, teamNumber: number) => FirstApiTeamListing | null;
  loadFirstApiTeam: (season: SeasonId, teamNumber: number) => Promise<FirstApiTeamListing | null>;
};

/**
 * Optional live FIRST API identity listing via `/ftc-api-proxy`.
 * 503 / missing secrets fail soft and do not surface as a directory error.
 */
export function useFirstApiTeam(): UseFirstApiTeamResult {
  const [listings, setListings] = useState<Record<string, FirstApiTeamListing | null>>({});
  const inFlight = useRef<Set<string>>(new Set());

  const getFirstApiTeam = useCallback(
    (season: SeasonId, teamNumber: number) => listings[listingKey(season, teamNumber)] ?? null,
    [listings],
  );

  const loadFirstApiTeam = useCallback(
    async (season: SeasonId, teamNumber: number) => {
      const key = listingKey(season, teamNumber);
      if (Object.prototype.hasOwnProperty.call(listings, key)) {
        return listings[key];
      }
      if (inFlight.current.has(key)) {
        return listings[key] ?? null;
      }

      inFlight.current.add(key);
      try {
        const result = await fetchFirstApiTeamFromProxy(Number(season), teamNumber);
        const listing =
          result.ok && result.data
            ? {
                team: result.data,
                season,
                retrievedAt: new Date().toISOString(),
              }
            : null;
        setListings((current) => ({ ...current, [key]: listing }));
        return listing;
      } catch {
        setListings((current) => ({ ...current, [key]: null }));
        return null;
      } finally {
        inFlight.current.delete(key);
      }
    },
    [listings],
  );

  return { getFirstApiTeam, loadFirstApiTeam };
}
