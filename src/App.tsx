import { useEffect, useState } from 'react';
import {
  loadDirectoryBootstrap,
  type DirectoryBootstrapResult,
} from './data/loadDirectoryBootstrap';
import type { GeneratedData } from './data/schema';
import type { DirectorySnapshotSource } from './data/snapshotDirectory';
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
  | {
      status: 'ready';
      data: GeneratedData;
      source: DirectorySnapshotSource;
      warnings: string[];
    }
  | { status: 'error'; result: Extract<DirectoryBootstrapResult, { ok: false }> };

export default function App() {
  const [seedState, setSeedState] = useState<SeedLoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await loadDirectoryBootstrap();
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
      if (result.warnings.length > 0) {
        console.warn('[directory-bootstrap]', result.warnings);
      }

      setSeedState({
        status: 'ready',
        data: result.data,
        source: result.source,
        warnings: result.warnings,
      });
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

  return (
    <AppDirectory
      seedData={seedState.data}
      snapshotSource={seedState.source}
      bootstrapWarnings={seedState.warnings}
    />
  );
}
