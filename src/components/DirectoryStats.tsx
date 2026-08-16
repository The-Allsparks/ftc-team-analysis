import { statLabel } from '../lib/teamDirectory';

export type DirectoryStatsProps = {
  teamCount: number;
  activeSeasonCount: number;
  eventCount: number;
  awardCount: number;
  portfolioCount: number;
};

export function DirectoryStats({
  teamCount,
  activeSeasonCount,
  eventCount,
  awardCount,
  portfolioCount,
}: DirectoryStatsProps) {
  return (
    <section className="stats-grid" aria-label="Data summary">
      <article>
        <span>{teamCount}</span>
        <p>{statLabel(teamCount, 'team')}</p>
      </article>
      <article>
        <span>{activeSeasonCount}</span>
        <p>{statLabel(activeSeasonCount, 'team-season')}</p>
      </article>
      <article>
        <span>{eventCount}</span>
        <p>{statLabel(eventCount, 'parsed event')}</p>
      </article>
      <article>
        <span>{awardCount}</span>
        <p>{statLabel(awardCount, 'award')}</p>
      </article>
      <article>
        <span>{portfolioCount}</span>
        <p>{statLabel(portfolioCount, 'portfolio match', 'portfolio matches')}</p>
      </article>
    </section>
  );
}
