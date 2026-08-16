import { useEffect, useState } from 'react';
import { GeneratedData } from './data/schema';
import { loadGeneratedSeed, LoadGeneratedSeedResult } from './data/loadGeneratedSeed';
import { loadTeamObservations } from './data/loadTeamObservations';
import { regionCatalogResult } from './data/regions';
import { attachObservationsToData } from './lib/teamObservations';
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

    void (async () => {
      const seedResult = await loadGeneratedSeed();
      if (cancelled) {
        return;
      }

      if (!seedResult.ok) {
        setSeedState({ status: 'error', result: seedResult });
        return;
      }

      if (seedResult.quarantined.length > 0) {
        console.warn('[generated-seed] quarantined invalid records', seedResult.quarantined);
      }

      const observationsResult = await loadTeamObservations(
        undefined,
        fetch,
        seedResult.data.regionCode,
      );
      if (cancelled) {
        return;
      }

      let data = seedResult.data;
      if (observationsResult.ok) {
        if (observationsResult.quarantined.length > 0) {
          console.warn('[observations] quarantined invalid records', observationsResult.quarantined);
        }
        data = attachObservationsToData(data, observationsResult.data);
      } else {
        console.warn('[observations]', observationsResult.message, observationsResult.issues);
      }

      setSeedState({ status: 'ready', data });
    })();

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
