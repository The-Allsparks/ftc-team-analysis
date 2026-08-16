import { useEffect, useState } from 'react';
import { GeneratedData } from './data/schema';
import { loadGeneratedSeed, LoadGeneratedSeedResult } from './data/loadGeneratedSeed';
import { regionCatalogResult } from './data/regions';
import { AppDirectory } from './components/AppDirectory';
import {
  RegionCatalogEnvelopeError,
  SeedEnvelopeError,
  SeedLoadError,
  SeedLoading,
} from './components/SeedLoadStates';

type SeedLoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: GeneratedData }
  | { status: 'error'; result: Extract<LoadGeneratedSeedResult, { ok: false }> };

export default function App() {
  const [seedState, setSeedState] = useState<SeedLoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    void loadGeneratedSeed().then((result) => {
      if (cancelled) {
        return;
      }

      if (!result.ok) {
        setSeedState({ status: 'error', result });
        return;
      }

      if (result.quarantined.length > 0) {
        console.warn('[generated-seed] quarantined invalid records', result.quarantined);
      }

      setSeedState({ status: 'ready', data: result.data });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!regionCatalogResult.ok) {
    return <RegionCatalogEnvelopeError issues={regionCatalogResult.issues} />;
  }

  if (seedState.status === 'loading') {
    return <SeedLoading />;
  }

  if (seedState.status === 'error') {
    if (seedState.result.kind === 'invalid-envelope' && seedState.result.issues) {
      return <SeedEnvelopeError issues={seedState.result.issues} />;
    }

    return (
      <SeedLoadError
        message={seedState.result.message}
        diagnostics={seedState.result.diagnostics}
        issues={seedState.result.issues}
      />
    );
  }

  return <AppDirectory seedData={seedState.data} />;
}
