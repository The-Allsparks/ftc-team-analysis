import { GeneratedData, SeasonId } from '../data/schema';
import type { DirectorySnapshotSource } from '../data/snapshotDirectory';
import { SeasonFallbackState } from '../hooks/useFtcData';
import { LiveRefreshProgress, LiveRefreshStatus } from '../lib/ftcLive';
import { ALL_SEASONS, SeasonFilter, seasonLabel } from '../lib/teamDirectory';
import { SourceStatusBlock } from './SourceStatusBlock';

export type DirectoryHeroProps = {
  regionName: string;
  regionCode: string;
  data: GeneratedData;
  defaultSeason: SeasonId;
  seasonFilter: SeasonFilter;
  liveStatus: LiveRefreshStatus;
  liveMessage: string | null;
  liveDiagnostics: string | null;
  liveProgress: LiveRefreshProgress | null;
  seasonFallback: SeasonFallbackState | null;
  snapshotSource?: DirectorySnapshotSource;
  bootstrapWarnings?: string[];
  refreshRegion: (season: SeasonId, force?: boolean) => Promise<void>;
  refreshSeason: (season: SeasonId, force?: boolean) => Promise<void>;
  portfolioStatus: 'idle' | 'loading' | 'ready' | 'error';
  portfolioMessage: string | null;
  portfolioDiagnostics: string | null;
  avatarStatus: 'idle' | 'loading' | 'ready' | 'error';
  avatarMessage: string | null;
  avatarDiagnostics: string | null;
};

export function DirectoryHero({
  regionName,
  regionCode,
  data,
  defaultSeason,
  seasonFilter,
  liveStatus,
  liveMessage,
  liveDiagnostics,
  liveProgress,
  seasonFallback,
  snapshotSource = 'mega-seed',
  bootstrapWarnings = [],
  refreshRegion,
  refreshSeason,
  portfolioStatus,
  portfolioMessage,
  portfolioDiagnostics,
  avatarStatus,
  avatarMessage,
  avatarDiagnostics,
}: DirectoryHeroProps) {
  return (
    <header className="hero">
      <div>
        <p className="eyebrow">
          By{' '}
          <a className="brand-link" href="https://www.theallsparks.org/" target="_blank" rel="noreferrer">
            The Allsparks
          </a>
        </p>
        <h1>{regionName} FTC Team Analysis</h1>
        <p className="hero-copy">
          Explore {regionName}-region FTC teams from the static snapshot first. Live FTC Events refresh runs when you
          ask for it, when a season or team slice is missing, or when you switch to a region without a local tree.
        </p>
      </div>
      <div className="source-card">
        <span>Snapshot</span>
        <strong>{new Date(data.generatedAt).toLocaleString()}</strong>
        <span>Load path</span>
        <strong>{snapshotSource === 'tree' ? 'Static tree (summary first)' : 'Mega-seed fallback'}</strong>
        {data.liveRefreshedAt && (
          <>
            <span>Live cache</span>
            <strong>{new Date(data.liveRefreshedAt).toLocaleString()}</strong>
          </>
        )}
        <div className="refresh-actions">
          <button
            type="button"
            disabled={liveStatus === 'refreshing'}
            onClick={() => void refreshRegion(defaultSeason, true)}
          >
            Refresh roster
          </button>
          <button
            type="button"
            disabled={liveStatus === 'refreshing'}
            onClick={() => void refreshSeason(seasonFilter === ALL_SEASONS ? defaultSeason : seasonFilter, true)}
          >
            Refresh season
          </button>
        </div>
        {seasonFallback && (
          <p className="season-fallback-banner" role="status">
            {seasonLabel(seasonFallback.requestedSeason)} is not yet published on FTC Events. Showing{' '}
            {seasonLabel(seasonFallback.activeSeason)} instead.
          </p>
        )}
        {bootstrapWarnings.length > 0 && (
          <SourceStatusBlock
            statusClass="live-status idle"
            message={bootstrapWarnings[0] ?? null}
            diagnostics={bootstrapWarnings.length > 1 ? bootstrapWarnings.slice(1).join('\n') : null}
          />
        )}
        {liveMessage && (
          <SourceStatusBlock
            statusClass={`live-status ${liveStatus}`}
            message={liveMessage}
            diagnostics={liveDiagnostics}
          />
        )}
        {liveProgress && liveProgress.total > 1 && (
          <p className="live-progress">
            {liveProgress.label} ({liveProgress.completed}/{liveProgress.total})
          </p>
        )}
        <a
          href={`https://ftc-events.firstinspires.org/${defaultSeason}/region/${regionCode}`}
          target="_blank"
          rel="noreferrer"
        >
          {regionName} region source
        </a>
        <a href="https://www.ftcportfoliolab.org/portfolio" target="_blank" rel="noreferrer">
          FTC Portfolio Lab
        </a>
        <a href="https://ftcscout.org" target="_blank" rel="noreferrer">
          FTCScout
        </a>
        {portfolioMessage && (
          <SourceStatusBlock
            statusClass={`portfolio-status ${portfolioStatus}`}
            message={portfolioMessage}
            diagnostics={portfolioDiagnostics}
          />
        )}
        {avatarStatus === 'error' && avatarMessage && (
          <SourceStatusBlock
            statusClass="avatar-status error"
            message={avatarMessage}
            diagnostics={avatarDiagnostics}
          />
        )}
      </div>
    </header>
  );
}
