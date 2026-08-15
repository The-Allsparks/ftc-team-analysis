import { useCallback, useEffect, useRef, useState } from 'react';
import { SeasonId } from '../data/schema';
import {
  avatarComposedYear,
  fetchComposedAvatarCss,
  parseTeamAvatarPathFromCss,
  teamAvatarImageUrl,
} from '../lib/teamAvatar';
import { SourceState } from '../lib/sourceResult';

type CatalogStatus = 'idle' | 'loading' | 'ready' | 'error';

type UseTeamAvatarCatalogResult = {
  status: CatalogStatus;
  sourceState: SourceState | null;
  message: string | null;
  diagnostics: string | null;
  getAvatarUrl: (teamNumber: number) => string | null;
  refreshCatalog: (force?: boolean) => Promise<void>;
};

export function useTeamAvatarCatalog(season: SeasonId | null): UseTeamAvatarCatalogResult {
  const [css, setCss] = useState<string | null>(null);
  const [status, setStatus] = useState<CatalogStatus>('idle');
  const [sourceState, setSourceState] = useState<SourceState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<string | null>(null);
  const composedYear = season ? avatarComposedYear(season) : null;
  const inFlight = useRef<number | null>(null);

  const refreshCatalog = useCallback(
    async (force = false) => {
      if (composedYear === null) {
        setCss(null);
        setStatus('idle');
        setSourceState(null);
        setMessage(null);
        setDiagnostics(null);
        return;
      }

      if (!force && inFlight.current === composedYear) {
        return;
      }

      inFlight.current = composedYear;
      setStatus('loading');
      setSourceState(null);
      setDiagnostics(null);
      setMessage(`Loading FIRST team avatars for ${composedYear}...`);

      try {
        const result = await fetchComposedAvatarCss(composedYear, { force });
        setSourceState(result.state);
        setDiagnostics(result.diagnostics ?? null);

        if (result.ok) {
          setCss(result.data);
          setStatus('ready');
          setMessage(
            result.state === 'no_record'
              ? 'Team avatar catalog is empty for this season.'
              : 'Team avatar catalog ready.',
          );
          return;
        }

        setCss(null);
        setStatus('error');
        setMessage(result.userMessage);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        setCss(null);
        setStatus('error');
        setSourceState('upstream_unavailable');
        setMessage('Team avatars unavailable.');
        setDiagnostics(errorMessage);
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
    sourceState,
    message,
    diagnostics,
    getAvatarUrl,
    refreshCatalog,
  };
}
