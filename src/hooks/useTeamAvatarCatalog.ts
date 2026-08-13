import { useCallback, useEffect, useRef, useState } from 'react';
import { SeasonId } from '../data/schema';
import {
  avatarComposedYear,
  fetchComposedAvatarCss,
  parseTeamAvatarPathFromCss,
  teamAvatarImageUrl,
} from '../lib/teamAvatar';

type CatalogStatus = 'idle' | 'loading' | 'ready' | 'error';

type UseTeamAvatarCatalogResult = {
  status: CatalogStatus;
  message: string | null;
  getAvatarUrl: (teamNumber: number) => string | null;
  refreshCatalog: (force?: boolean) => Promise<void>;
};

export function useTeamAvatarCatalog(season: SeasonId | null): UseTeamAvatarCatalogResult {
  const [css, setCss] = useState<string | null>(null);
  const [status, setStatus] = useState<CatalogStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const composedYear = season ? avatarComposedYear(season) : null;
  const inFlight = useRef<number | null>(null);

  const refreshCatalog = useCallback(
    async (force = false) => {
      if (composedYear === null) {
        setCss(null);
        setStatus('idle');
        setMessage(null);
        return;
      }

      if (!force && inFlight.current === composedYear) {
        return;
      }

      inFlight.current = composedYear;
      setStatus('loading');
      setMessage(`Loading FIRST team avatars for ${composedYear}...`);

      try {
        const stylesheet = await fetchComposedAvatarCss(composedYear, { force });
        setCss(stylesheet);
        setStatus('ready');
        setMessage('Team avatar catalog ready.');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        setCss(null);
        setStatus('error');
        setMessage(`Team avatars unavailable: ${errorMessage}`);
      } finally {
        inFlight.current = null;
      }
    },
    [composedYear],
  );

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  const getAvatarUrl = useCallback(
    (teamNumber: number) => {
      if (!css) {
        return null;
      }

      const relativePath = parseTeamAvatarPathFromCss(css, teamNumber);
      return relativePath ? teamAvatarImageUrl(relativePath) : null;
    },
    [css],
  );

  return {
    status,
    message,
    getAvatarUrl,
    refreshCatalog,
  };
}
