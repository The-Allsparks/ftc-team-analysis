import { GeneratedData, SeasonId } from '../data/schema';
import { LiveRefreshProgress, LiveRefreshStatus } from '../lib/ftcLive';
import { ALL_SEASONS, SeasonFilter } from '../lib/teamDirectory';
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
          Explore {regionName}-region FTC teams across seasons. Empty seasons (like a brand-new BIOBUZZ snapshot)
          pull automatically from FTC Events. Nevada also keeps the checked-in multi-season snapshot.
        </p>
      </div>
      <div className="source-card">
        <span>Snapshot</span>
        <strong>{new Date(data.generatedAt).toLocaleString()}</strong>
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
