import { PortfolioLabEntry, portfoliosForSeason } from '../data/portfolioLab';
import { Team } from '../data/schema';
import {
  ALL_SEASONS,
  SeasonFilter,
  seasonFor,
  seasonValues,
} from '../lib/teamDirectory';
import { TeamAvatar } from './TeamAvatar';

export type TeamListProps = {
  teams: Team[];
  selectedTeamNumber: number | null;
  seasonFilter: SeasonFilter;
  portfoliosByTeam: Map<number, PortfolioLabEntry[]>;
  getAvatarUrl: (teamNumber: number) => string | null;
  onSelectTeam: (teamNumber: number) => void;
};

export function TeamList({
  teams,
  selectedTeamNumber,
  seasonFilter,
  portfoliosByTeam,
  getAvatarUrl,
  onSelectTeam,
}: TeamListProps) {
  return (
    <aside className="team-list" aria-label="Filtered teams">
      <div className="section-heading">
        <h2>Teams</h2>
        <span>{teams.length} shown</span>
      </div>
      <div className="team-list-scroll">
        {teams.map((team) => {
          const season = seasonFor(team, seasonFilter);
          const awards = seasonValues(team).reduce((total, item) => total + (item.awards?.length ?? 0), 0);
          const events = seasonValues(team).reduce((total, item) => total + (item.events?.length ?? 0), 0);
          const teamPortfolios = portfoliosByTeam.get(team.number) ?? [];
          const portfolios =
            seasonFilter === ALL_SEASONS
              ? teamPortfolios.length
              : portfoliosForSeason(teamPortfolios, seasonFilter).length;

          return (
            <button
              key={team.number}
              className={team.number === selectedTeamNumber ? 'team-row selected' : 'team-row'}
              onClick={() => onSelectTeam(team.number)}
            >
              <span className="team-row-leading">
                <TeamAvatar
                  teamNumber={team.number}
                  name={team.latestName}
                  imageUrl={getAvatarUrl(team.number)}
                  size="sm"
                />
                <span className="team-number">{team.number}</span>
              </span>
              <span className="team-main">
                <strong>{team.latestName}</strong>
                <small>{season?.location ?? team.latestLocation}</small>
              </span>
              <span className="team-meta">
                {events > 0 && <span>{events} events</span>}
                {awards > 0 && <span>{awards} awards</span>}
                {portfolios > 0 && <span>{portfolios} portfolios</span>}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
