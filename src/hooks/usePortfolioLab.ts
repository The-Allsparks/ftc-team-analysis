import { useCallback, useEffect, useMemo, useState } from 'react';
import { PortfolioLabCatalog, PortfolioLabEntry } from '../data/portfolioLab';
import { fetchPortfolioLabCatalog, indexPortfoliosByTeam } from '../lib/portfolioLab';
import { SourceState } from '../lib/sourceResult';

type PortfolioLabStatus = 'idle' | 'loading' | 'ready' | 'error';

type UsePortfolioLabResult = {
  portfolios: PortfolioLabEntry[];
  portfoliosByTeam: Map<number, PortfolioLabEntry[]>;
  portfolioTeamNumbers: Set<number>;
  status: PortfolioLabStatus;
  sourceState: SourceState | null;
  message: string | null;
  diagnostics: string | null;
  fetchedAt: string | null;
  refreshCatalog: (force?: boolean) => Promise<void>;
};

export function usePortfolioLab(): UsePortfolioLabResult {
  const [catalog, setCatalog] = useState<PortfolioLabCatalog | null>(null);
  const [status, setStatus] = useState<PortfolioLabStatus>('idle');
  const [sourceState, setSourceState] = useState<SourceState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<string | null>(null);

  const refreshCatalog = useCallback(async (force = false) => {
    setStatus('loading');
    setSourceState(null);
    setDiagnostics(null);
    setMessage('Loading FTC Portfolio Lab catalog...');

    try {
      const result = await fetchPortfolioLabCatalog({ force });
      setSourceState(result.state);
      setDiagnostics(result.diagnostics ?? null);

      if (result.ok) {
        setCatalog(result.data);
        setStatus('ready');
        setMessage(
          result.state === 'no_record'
            ? 'Portfolio Lab returned no rated portfolios.'
            : `Loaded ${result.data.portfolios.length} rated portfolios from FTC Portfolio Lab.`,
        );
        return;
      }

      setStatus('error');
      setMessage(result.userMessage);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setStatus('error');
      setSourceState('upstream_unavailable');
      setMessage('Portfolio Lab catalog unavailable.');
      setDiagnostics(errorMessage);
    }
  }, []);

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  const portfolios = catalog?.portfolios ?? [];
  const portfoliosByTeam = useMemo(() => indexPortfoliosByTeam(portfolios), [portfolios]);
  const portfolioTeamNumbers = useMemo(() => new Set(portfoliosByTeam.keys()), [portfoliosByTeam]);

  return {
    portfolios,
    portfoliosByTeam,
    portfolioTeamNumbers,
    status,
    sourceState,
    message,
    diagnostics,
    fetchedAt: catalog?.fetchedAt ?? null,
    refreshCatalog,
  };
}
