import {
  formatScoutNumber,
  formatScoutRank,
  ftcScoutEventUrl,
  ftcScoutTeamUrl,
  TeamScoutData,
} from '../data/ftcScout';
import {
  SCOUT_API_DOCS_URL,
  SCOUT_CALCULATED_LABEL,
  SCOUT_CROSS_SEASON_WARNING,
  SCOUT_META_CATALOG_VERSION,
  SCOUT_RANKING_SCOPE_LABEL,
  SCOUT_SCORE_SPREAD_LABEL,
  scoutSampleSizeCaption,
} from '../data/ftcScoutMeta';
import { PortfolioLabEntry, portfolioCoverUrl, portfolioLabSearchUrl } from '../data/portfolioLab';
import {
  RegionEvent,
  SeasonId,
  Team,
  TeamAward,
  TeamFactField,
  TeamSeason,
} from '../data/schema';
import { evidenceForSeasonField, formatProvenanceSummary } from '../lib/fieldEvidence';
import { LiveRefreshStatus } from '../lib/ftcLive';
import {
  hostAffiliations,
  sponsorAffiliations,
} from '../lib/organizationAffiliations';
import { toPortfolioLabProxyUrl } from '../lib/portfolioLab';
import {
  advancementLabel,
  advancementStatus,
  eventKey,
  seasonLabel,
  teamTypeLabel,
} from '../lib/teamDirectory';
import {
  formatRelationshipTypeLabel,
  TeamLineage,
  TeamLineageLink,
  visibleRelatedLinks,
} from '../teamLineage';
import { TeamAvatar } from './TeamAvatar';
import { SourceStatusBlock } from './SourceStatusBlock';

function FactProvenance({ season, field }: { season: TeamSeason; field: TeamFactField }) {
  const rows = evidenceForSeasonField(season, field);
  if (rows.length === 0) {
    return null;
  }

  const current = rows.find((row) => row.status === 'current') ?? rows[0];
  const summary = formatProvenanceSummary(rows);

  return (
    <small className="fact-provenance">
      <span className="fact-provenance-label">Source</span>
      {current?.sourceUrl ? (
        <a href={current.sourceUrl} target="_blank" rel="noreferrer">
          {summary}
        </a>
      ) : (
        <span>{summary}</span>
      )}
    </small>
  );
}

function awardKey(award: Partial<TeamAward>, index: number) {
  return `${award.name ?? 'award'}-${award.eventName ?? 'event'}-${index}`;
}

function formatAffiliationNames(names: string[]): string {
  return names.length > 0 ? names.join(', ') : 'Not listed';
}

function OrganizationIdentity({ season }: { season: TeamSeason }) {
  const hosts = hostAffiliations(season);
  const sponsors = sponsorAffiliations(season);
  const hasStructured = hosts.length > 0 || sponsors.length > 0;

  if (!season.organization && !hasStructured) {
    return (
      <div>
        <span>Organization / Sponsors</span>
        <strong>Not available publicly yet</strong>
        <FactProvenance season={season} field="organization" />
      </div>
    );
  }

  if (!hasStructured) {
    return (
      <div>
        <span>Organization / Sponsors</span>
        <strong>{season.organization}</strong>
        <FactProvenance season={season} field="organization" />
      </div>
    );
  }

  return (
    <>
      <div>
        <span>School / Host</span>
        <strong>{formatAffiliationNames(hosts.map((row) => row.name))}</strong>
        {hosts.some((row) => row.confidence === 'low') && (
          <small className="record-key">Parsed from public sponsor line; low confidence</small>
        )}
        <FactProvenance season={season} field="organization" />
      </div>
      <div>
        <span>Sponsors</span>
        <strong>{formatAffiliationNames(sponsors.map((row) => row.name))}</strong>
        <FactProvenance season={season} field="organization" />
      </div>
    </>
  );
}

export type TeamDetailPanelProps = {
  selectedTeam: Team | null;
  selectedSeason: TeamSeason | null;
  selectedSeasons: TeamSeason[];
  regionCode: string;
  regionEvents: RegionEvent[];
  getAvatarUrl: (teamNumber: number) => string | null;
  liveStatus: LiveRefreshStatus;
  refreshTeam: (season: SeasonId, teamNumber: number, force?: boolean) => Promise<void>;
  setDetailSeason: (season: SeasonId) => void;
  setSelectedTeamNumber: (teamNumber: number) => void;
  selectedScoutData: TeamScoutData | null;
  scoutStatus: 'idle' | 'loading' | 'ready' | 'error';
  scoutMessage: string | null;
  scoutDiagnostics: string | null;
  loadTeamScout: (season: SeasonId, teamNumber: number, force?: boolean) => Promise<TeamScoutData | null>;
  selectedLineage: TeamLineage | null;
  selectedPortfolios: PortfolioLabEntry[];
  portfolioStatus: 'idle' | 'loading' | 'ready' | 'error';
  refreshPortfolioCatalog: (force?: boolean) => Promise<unknown>;
};

export default function TeamDetailPanel({
  selectedTeam,
  selectedSeason,
  selectedSeasons,
  regionCode,
  regionEvents,
  getAvatarUrl,
  liveStatus,
  refreshTeam,
  setDetailSeason,
  setSelectedTeamNumber,
  selectedScoutData,
  scoutStatus,
  scoutMessage,
  scoutDiagnostics,
  loadTeamScout,
  selectedLineage,
  selectedPortfolios,
  portfolioStatus,
  refreshPortfolioCatalog,
}: TeamDetailPanelProps) {
  const relatedTeams = selectedLineage ? visibleRelatedLinks(selectedLineage) : [];
  const sisterRelated = relatedTeams.filter((link) => link.relationshipType === 'sister_team');
  const earlierRelated = selectedLineage
    ? selectedLineage.priorTeams.filter(
        (link) => link.confirmationState !== 'rejected' && link.relationshipType !== 'sister_team',
      )
    : [];
  const laterRelated = selectedLineage
    ? selectedLineage.successorTeams.filter(
        (link) => link.confirmationState !== 'rejected' && link.relationshipType !== 'sister_team',
      )
    : [];
  const scoutSampleCaption = scoutSampleSizeCaption(selectedScoutData?.quickStats?.count);

  return (
    <section className="detail-panel" aria-label="Team details">
      {selectedTeam && selectedSeason ? (
        <>
          <div className="detail-header">
            <div className="detail-header-title">
              <TeamAvatar
                teamNumber={selectedTeam.number}
                name={selectedSeason.name}
                imageUrl={getAvatarUrl(selectedTeam.number)}
                size="md"
              />
              <div>
                <p className="eyebrow">Team {selectedTeam.number}</p>
                <h2>{selectedTeam.latestName}</h2>
                <FactProvenance season={selectedSeason} field="name" />
                <p>
                  {selectedSeason.location}
                  {selectedSeason.league ? ` - ${selectedSeason.league}` : ''}
                </p>
                <FactProvenance season={selectedSeason} field="location" />
              </div>
            </div>
            <div className="detail-actions">
              <button
                type="button"
                disabled={liveStatus === 'refreshing'}
                onClick={() => void refreshTeam(selectedSeason.season, selectedTeam.number, true)}
              >
                Refresh all seasons
              </button>
              <a className="source-link" href={selectedSeason.sourceUrl} target="_blank">
                Public team page
              </a>
            </div>
          </div>

          <div className="season-tabs" aria-label="Team seasons">
            {selectedSeasons.map((season) => (
              <button
                key={season.season}
                className={season.season === selectedSeason.season ? 'active' : ''}
                onClick={() => setDetailSeason(season.season)}
              >
                {seasonLabel(season.season)}
              </button>
            ))}
          </div>

          <div className="identity-grid">
            <OrganizationIdentity season={selectedSeason} />
            <div>
              <span>Website</span>
              <strong>
                {selectedSeason.website ? (
                  <a href={selectedSeason.website} target="_blank" rel="noreferrer">
                    {selectedSeason.website.replace(/^https?:\/\//, '')}
                  </a>
                ) : (
                  'Not listed'
                )}
              </strong>
              <FactProvenance season={selectedSeason} field="website" />
            </div>
            <div>
              <span>Rookie Year</span>
              <strong>{selectedSeason.rookieYear ?? 'Unknown'}</strong>
            </div>
            <div>
              <span>Team Type</span>
              <strong>{teamTypeLabel(selectedSeason.teamType)}</strong>
              <FactProvenance season={selectedSeason} field="teamType" />
            </div>
            <div>
              <span>Advancement</span>
              <strong>{advancementLabel(advancementStatus(selectedSeason, regionCode))}</strong>
            </div>
            <div>
              <span>Season Record</span>
              <strong>{selectedSeason.record?.text ?? 'Not parsed yet'}</strong>
              {selectedSeason.record && <small className="record-key">W-L-T = wins-losses-ties</small>}
              <FactProvenance season={selectedSeason} field="record" />
            </div>
            <div>
              <span>Robot</span>
              <strong>{selectedSeason.robot ?? 'Not listed'}</strong>
            </div>
          </div>

          {selectedSeason.summary && <p className="summary">{selectedSeason.summary}</p>}
          {selectedSeason.liveSource && !selectedSeason.liveSource.ok && (
            <SourceStatusBlock
              statusClass="live-status error"
              message={
                selectedSeason.liveSource.userMessage ??
                'Could not refresh the live FTC Events page. Showing the placeholder season row.'
              }
              diagnostics={selectedSeason.liveSource.diagnostics}
            />
          )}

          <section className="scout-panel">
            <div className="section-heading">
              <h3>FTCScout Analytics</h3>
              <span>{selectedScoutData?.events.length ?? 0}</span>
            </div>
            <p className="scout-provenance">
              <span>{SCOUT_CALCULATED_LABEL}</span>
              <span>
                {SCOUT_RANKING_SCOPE_LABEL} · meta {SCOUT_META_CATALOG_VERSION} ·{' '}
                {seasonLabel(selectedSeason.season)}
              </span>
              {scoutSampleCaption ? <span>{scoutSampleCaption}</span> : null}
              <a href={SCOUT_API_DOCS_URL} target="_blank" rel="noreferrer">
                FTCScout API docs
              </a>
            </p>
            {selectedSeasons.length > 1 && (
              <p className="scout-cross-season-note">{SCOUT_CROSS_SEASON_WARNING}</p>
            )}
            {scoutStatus === 'loading' && !selectedScoutData ? (
              <p className="empty-note">Loading OPR and event analytics from FTCScout...</p>
            ) : scoutStatus === 'error' && !selectedScoutData?.quickStats ? (
              <p className="empty-note">
                FTCScout stats are temporarily unavailable for this team. Try refresh analytics again shortly.
              </p>
            ) : selectedScoutData?.quickStats ? (
              <div className="scout-quick-stats">
                <article>
                  <span>Total OPR</span>
                  <strong>{formatScoutNumber(selectedScoutData.quickStats.tot.value)}</strong>
                  <small>{formatScoutRank(selectedScoutData.quickStats.tot.rank)} world</small>
                </article>
                <article>
                  <span>Auto OPR</span>
                  <strong>{formatScoutNumber(selectedScoutData.quickStats.auto.value)}</strong>
                  <small>{formatScoutRank(selectedScoutData.quickStats.auto.rank)} world</small>
                </article>
                <article>
                  <span>TeleOp OPR</span>
                  <strong>{formatScoutNumber(selectedScoutData.quickStats.dc.value)}</strong>
                  <small>{formatScoutRank(selectedScoutData.quickStats.dc.rank)} world</small>
                </article>
                <article>
                  <span>Endgame OPR</span>
                  <strong>{formatScoutNumber(selectedScoutData.quickStats.eg.value)}</strong>
                  <small>{formatScoutRank(selectedScoutData.quickStats.eg.rank)} world</small>
                </article>
              </div>
            ) : (
              <p className="empty-note">FTCScout does not have season-level quick stats for this team yet.</p>
            )}
            {(selectedScoutData?.events.length ?? 0) > 0 && (
              <div className="table-wrap scout-event-table">
                <table>
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Rank</th>
                      <th>Record</th>
                      <th>Event OPR</th>
                      <th>Avg Points</th>
                      <th>{SCOUT_SCORE_SPREAD_LABEL}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedScoutData!.events.map((participation) => {
                      const eventName =
                        selectedSeason.events?.find((event) => event.code === participation.eventCode)?.name ??
                        regionEvents.find(
                          (event) =>
                            event.season === selectedSeason.season && event.code === participation.eventCode,
                        )?.name ??
                        participation.eventCode;

                      return (
                        <tr key={`${participation.season}-${participation.eventCode}`}>
                          <td>
                            <a
                              href={ftcScoutEventUrl(selectedSeason.season, participation.eventCode)}
                              target="_blank"
                            >
                              {eventName}
                            </a>
                          </td>
                          <td>{participation.stats?.rank ?? '-'}</td>
                          <td>
                            {participation.stats
                              ? `${participation.stats.wins}-${participation.stats.losses}-${participation.stats.ties}`
                              : '-'}
                          </td>
                          <td>{formatScoutNumber(participation.stats?.opr?.totalPoints ?? null)}</td>
                          <td>{formatScoutNumber(participation.stats?.avg?.totalPoints ?? null)}</td>
                          <td>{formatScoutNumber(participation.stats?.scoreSpread ?? null)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="scout-toolbar">
              <a href={ftcScoutTeamUrl(selectedTeam.number, selectedSeason.season)} target="_blank">
                Open on FTCScout
              </a>
              <button
                type="button"
                disabled={scoutStatus === 'loading'}
                onClick={() => void loadTeamScout(selectedSeason.season, selectedTeam.number, true)}
              >
                Refresh analytics
              </button>
            </div>
            {scoutMessage && (
              <SourceStatusBlock
                statusClass={`scout-status ${scoutStatus}`}
                message={scoutMessage}
                diagnostics={scoutDiagnostics}
              />
            )}
          </section>

          {relatedTeams.length > 0 && selectedLineage && (
            <section className="lineage-panel">
              <div className="section-heading">
                <h3>Possible Related Teams</h3>
                <span>{relatedTeams.length}</span>
              </div>
              <p className="lineage-note">
                Inferred from shared school affiliations and season timing. These are evidence-backed
                relationship candidates, not confirmed predecessor/successor chains, unless a curator
                override marks them confirmed.
              </p>
              {sisterRelated.length > 0 && (
                <RelatedGroup
                  title="Sister / concurrent teams"
                  links={sisterRelated}
                  keyPrefix="sister"
                  onSelect={setSelectedTeamNumber}
                />
              )}
              {earlierRelated.length > 0 && (
                <RelatedGroup
                  title="Earlier team numbers"
                  links={earlierRelated}
                  keyPrefix="prior"
                  onSelect={setSelectedTeamNumber}
                />
              )}
              {laterRelated.length > 0 && (
                <RelatedGroup
                  title="Later team numbers"
                  links={laterRelated}
                  keyPrefix="successor"
                  onSelect={setSelectedTeamNumber}
                />
              )}
            </section>
          )}

          {(selectedTeam.links?.length ?? 0) > 0 && (
            <section className="links-panel">
              <div className="section-heading">
                <h3>Useful Links</h3>
                <span>{selectedTeam.links.length}</span>
              </div>
              <div className="link-grid">
                {selectedTeam.links.map((link) => (
                  <a key={link.url} href={link.url} target="_blank" title={link.source}>
                    <strong>{link.label}</strong>
                    <span>{new URL(link.url).hostname.replace(/^www\./, '')}</span>
                  </a>
                ))}
              </div>
            </section>
          )}

          <section className="portfolio-panel">
            <div className="section-heading">
              <h3>FTC Portfolio Lab</h3>
              <span>{selectedPortfolios.length}</span>
            </div>
            {portfolioStatus === 'loading' && selectedPortfolios.length === 0 ? (
              <p className="empty-note">Loading rated engineering portfolios...</p>
            ) : selectedPortfolios.length > 0 ? (
              <div className="portfolio-grid">
                {selectedPortfolios.map((portfolio) => {
                  const cover = portfolioCoverUrl(portfolio);

                  return (
                    <article key={portfolio.id} className="portfolio-card">
                      {cover && (
                        <img
                          className="portfolio-cover"
                          src={toPortfolioLabProxyUrl(portfolio.cover!)}
                          alt={`${portfolio.teamName} portfolio cover`}
                          loading="lazy"
                        />
                      )}
                      <div className="portfolio-body">
                        <p className="portfolio-season">{portfolio.season}</p>
                        <p className="portfolio-rating">
                          <span>{portfolio.stars}</span>
                          <span>{portfolio.score}</span>
                        </p>
                        <p className="portfolio-meta">
                          {portfolio.level} · {portfolio.award}
                        </p>
                        <p className="portfolio-summary">{portfolio.summary}</p>
                        <div className="portfolio-actions">
                          <a href={portfolio.pdf} target="_blank">
                            View PDF
                          </a>
                          <a href={portfolioLabSearchUrl(portfolio.teamNumber)} target="_blank">
                            Open in Portfolio Lab
                          </a>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : portfolioStatus === 'error' ? (
              <p className="empty-note">
                Portfolio Lab is temporarily unavailable, so rated portfolios cannot be shown right now.
              </p>
            ) : (
              <p className="empty-note">
                No rated engineering portfolios are listed for this team on{' '}
                <a href="https://www.ftcportfoliolab.org/portfolio" target="_blank">
                  FTC Portfolio Lab
                </a>
                .
              </p>
            )}
            <div className="portfolio-toolbar">
              <button
                type="button"
                disabled={portfolioStatus === 'loading'}
                onClick={() => void refreshPortfolioCatalog(true)}
              >
                Refresh portfolios
              </button>
            </div>
          </section>

          <div className="detail-columns">
            <section>
              <div className="section-heading">
                <h3>Meets & Events</h3>
                <span>{selectedSeason.events?.length ?? 0}</span>
              </div>
              {(selectedSeason.events?.length ?? 0) > 0 ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Event</th>
                        <th>Event Rank</th>
                        <th>Total Points</th>
                        <th>Ranking Score</th>
                        <th>League Rank</th>
                        <th>Playoff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSeason.events.map((event) => (
                        <tr key={eventKey(event)}>
                          <td>{event.code ?? '-'}</td>
                          <td>
                            {event.sourceUrl ? (
                              <a href={event.sourceUrl} target="_blank">
                                {event.name}
                              </a>
                            ) : (
                              event.name
                            )}
                          </td>
                          <td>{event.rank ?? '-'}</td>
                          <td>{event.totalPoints ?? '-'}</td>
                          <td>{event.rankingScore ?? '-'}</td>
                          <td>
                            {event.leagueSeasonRank && event.leagueSeasonRankTotal
                              ? `${event.leagueSeasonRank} of ${event.leagueSeasonRankTotal}`
                              : '-'}
                          </td>
                          <td>{event.playoffRecord ?? event.allianceSelection ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="empty-note">Event rows have not been parsed for this team-season yet.</p>
              )}
            </section>

            <section>
              <div className="section-heading">
                <h3>Awards</h3>
                <span>{selectedSeason.awards?.length ?? 0}</span>
              </div>
              {(selectedSeason.awards?.length ?? 0) > 0 ? (
                <ul className="award-list">
                  {selectedSeason.awards.map((award, index) => (
                    <li key={awardKey(award, index)}>
                      <strong>{award.name}</strong>
                      <span>
                        {award.awardType} - {award.eventName}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-note">No awards are listed in the current generated data.</p>
              )}
            </section>
          </div>

          {(selectedSeason.notes?.length ?? 0) > 0 && (
            <section className="notes">
              <h3>Data Notes</h3>
              {selectedSeason.notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </section>
          )}
        </>
      ) : (
        <p className="empty-note">No team matches the current filters.</p>
      )}
    </section>
  );
}

function RelatedGroup({
  title,
  links,
  keyPrefix,
  onSelect,
}: {
  title: string;
  links: TeamLineageLink[];
  keyPrefix: string;
  onSelect: (teamNumber: number) => void;
}) {
  return (
    <div className="lineage-group">
      <h4>{title}</h4>
      <div className="lineage-list">
        {links.map((link) => (
          <button
            key={`${keyPrefix}-${link.teamNumber}`}
            type="button"
            className="lineage-card"
            onClick={() => onSelect(link.teamNumber)}
          >
            <span className="lineage-card-top">
              <strong>Team {link.teamNumber}</strong>
              <span className="lineage-badges">
                <span className="lineage-type">{formatRelationshipTypeLabel(link.relationshipType)}</span>
                <span className={`lineage-confidence ${link.confidence}`}>{link.confidence}</span>
              </span>
            </span>
            <span>{link.teamName}</span>
            <small>
              Seasons {link.seasonRange} — {link.matchReason}
            </small>
            <small className="lineage-explanation">{link.confidenceExplanation}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
