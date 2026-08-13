import { useCallback, useEffect, useMemo, useState } from 'react';
import { PortfolioLabCatalog, PortfolioLabEntry } from '../data/portfolioLab';
import { fetchPortfolioLabCatalog, indexPortfoliosByTeam } from '../lib/portfolioLab';

type PortfolioLabStatus = 'idle' | 'loading' | 'ready' | 'error';

type UsePortfolioLabResult = {
  portfolios: PortfolioLabEntry[];
  portfoliosByTeam: Map<number, PortfolioLabEntry[]>;
  portfolioTeamNumbers: Set<number>;
  status: PortfolioLabStatus;
  message: string | null;
  fetchedAt: string | null;
  refreshCatalog: (force?: boolean) => Promise<void>;
};

export function usePortfolioLab(): UsePortfolioLabResult {
  const [catalog, setCatalog] = useState<PortfolioLabCatalog | null>(null);
  const [status, setStatus] = useState<PortfolioLabStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const refreshCatalog = useCallback(async (force = false) => {
    setStatus('loading');
    setMessage('Loading FTC Portfolio Lab catalog...');

    try {
      const nextCatalog = await fetchPortfolioLabCatalog({ force });
      setCatalog(nextCatalog);
      setStatus('ready');
      setMessage(`Loaded ${nextCatalog.portfolios.length} rated portfolios from FTC Portfolio Lab.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setStatus('error');
      setMessage(`Portfolio Lab catalog unavailable: ${errorMessage}`);
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
    message,
    fetchedAt: catalog?.fetchedAt ?? null,
    refreshCatalog,
  };
}
