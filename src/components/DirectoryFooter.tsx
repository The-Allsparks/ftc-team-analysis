import { GeneratedData } from '../data/schema';
import { DATA_HEALTH_HASH } from '../lib/sourceHealthReport';
import { CORRECTIONS_HASH } from '../lib/teamCorrections';

export type DirectoryFooterProps = {
  data: GeneratedData;
};

export function DirectoryFooter({ data }: DirectoryFooterProps) {
  return (
    <footer>
      <div>
        <strong>Built by</strong>
        <a href="https://www.theallsparks.org/" target="_blank" rel="noreferrer">
          The Allsparks
        </a>
        <strong>Sources</strong>
        {data.sources.map((source) => (
          <a key={source.url} href={source.url} target="_blank" rel="noreferrer" title={source.note}>
            {source.label}
          </a>
        ))}
        <a
          href="https://www.ftcportfoliolab.org/portfolio"
          target="_blank"
          rel="noreferrer"
          title="Rated benchmark engineering portfolios and community PDF submissions."
        >
          FTC Portfolio Lab
        </a>
        <a
          href="https://ftcscout.org/api"
          target="_blank"
          rel="noreferrer"
          title="Community FTC statistics API used for OPR and event analytics."
        >
          FTCScout API
        </a>
        <a href={DATA_HEALTH_HASH} title="Maintainer snapshot and session source health">
          Data health
        </a>
        <a href={CORRECTIONS_HASH} title="Local team-correction moderation queue">
          Corrections queue
        </a>
      </div>
      <p>
        A public FTC explorer from{' '}
        <a href="https://www.theallsparks.org/" target="_blank" rel="noreferrer">
          The Allsparks
        </a>
        . {data.limitations.join(' ')} Portfolio Lab is optional enrichment from the public catalog (attributed to FTC
        Portfolio Lab), validated at runtime, and cached in the browser for 24 hours. FTCScout OPR and event analytics
        are calculated community statistics (not official FIRST results), labeled in the team detail panel, and cached
        per team-season for 30 minutes to 7 days.
      </p>
    </footer>
  );
}
