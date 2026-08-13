export const TARGET_SEASONS = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019] as const;

export type SeasonId = (typeof TARGET_SEASONS)[number];

export type RecordSummary = {
  wins: number;
  losses: number;
  ties: number;
  text: string;
};

export type TeamEvent = {
  code: string | null;
  name: string;
  dateRange: string | null;
  eventOrder: number | null;
  location: string | null;
  league: string | null;
  rank: string | null;
  totalPoints: number | null;
  matchCount: number;
  rankingScore: number | null;
  leagueSeasonRank: number | null;
  leagueSeasonRankTotal: number | null;
  qualificationUrl: string | null;
  playoffUrl: string | null;
  playoffRecord: string | null;
  allianceSelection: string | null;
  sourceUrl: string | null;
};

export type TeamAward = {
  name: string;
  awardType: string;
  eventName: string;
  eventCode: string | null;
  awardUrl: string | null;
  eventUrl: string | null;
};

export type TeamLink = {
  type: 'website' | 'social' | 'code' | 'video' | 'cad' | 'docs' | 'community' | 'link-hub' | 'other';
  label: string;
  url: string;
  source: string;
};

export type TeamSeason = {
  season: SeasonId;
  active: boolean;
  name: string;
  location: string;
  city: string | null;
  state: string | null;
  country: string | null;
  region: string | null;
  league: string | null;
  rookieYear: number | null;
  organization: string | null;
  teamType: 'school' | 'non-school' | 'unknown';
  website: string | null;
  robot: string | null;
  sourceUrl: string;
  summary: string | null;
  record: RecordSummary | null;
  qualificationRecord: RecordSummary | null;
  playoffRecord: RecordSummary | null;
  events: TeamEvent[];
  awards: TeamAward[];
  notes: string[];
};

export type Team = {
  number: number;
  latestName: string;
  latestLocation: string;
  latestCity: string | null;
  latestState: string | null;
  latestCountry: string | null;
  latestRookieYear: number | null;
  latestOrganization: string | null;
  latestWebsite: string | null;
  latestTeamType: 'school' | 'non-school' | 'unknown';
  latestLeague: string | null;
  latestRegion: string | null;
  links: TeamLink[];
  seasons: Partial<Record<SeasonId, TeamSeason>>;
};

export type RegionEvent = {
  season: SeasonId;
  code: string;
  name: string;
  league: string | null;
  location: string | null;
  date: string | null;
  sourceUrl: string;
};

export type DataSource = {
  label: string;
  url: string;
  note: string;
};

export type GeneratedData = {
  generatedAt: string;
  liveRefreshedAt?: string;
  targetSeasons: SeasonId[];
  regionCode: string;
  regionLabel?: string;
  teams: Team[];
  regionEvents: RegionEvent[];
  sources: DataSource[];
  limitations: string[];
};

export function seasonOptions(data?: Pick<GeneratedData, 'targetSeasons' | 'teams'>): SeasonId[] {
  const fromTeams =
    data?.teams.flatMap((team) =>
      Object.keys(team.seasons ?? {}).map((season) => Number(season) as SeasonId),
    ) ?? [];
  const fromTarget = data?.targetSeasons ?? [];

  return [...new Set([...TARGET_SEASONS, ...fromTarget, ...fromTeams])]
    .filter((season): season is SeasonId => (TARGET_SEASONS as readonly number[]).includes(season))
    .sort((a, b) => b - a);
}
