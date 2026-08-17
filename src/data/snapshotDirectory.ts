/**
 * Assemble a directory-ready GeneratedData shell from snapshot-tree pieces (#88).
 * Season rows are summary stubs until per-team JSON is loaded lazily.
 */
import type { GeneratedData, SeasonId, Team, TeamSeason } from './schema';
import { regionLabel } from './regions';
import type { RegionSeasonSummary, RegionSummaryTeam, SnapshotManifest } from './snapshotTreeSchema';

/** Marker on stub seasons built from region summaries (not full team-season JSON). */
export const SUMMARY_ONLY_NOTE = 'snapshot-summary';

export type DirectorySnapshotSource = 'tree' | 'mega-seed';

export function isSummaryOnlySeason(season: TeamSeason | null | undefined): boolean {
  return Boolean(season?.notes?.includes(SUMMARY_ONLY_NOTE));
}

export function isTeamSeasonDetailLoaded(team: Team | null | undefined, season: SeasonId): boolean {
  const row = team?.seasons?.[season];
  return Boolean(row) && !isSummaryOnlySeason(row);
}

export function summaryOnlySeason(
  season: SeasonId,
  row: RegionSummaryTeam,
  regionName: string,
): TeamSeason {
  return {
    season,
    active: row.active,
    name: row.name,
    location: row.location,
    city: row.city,
    state: null,
    country: null,
    region: regionName,
    league: row.league,
    rookieYear: null,
    organization: null,
    teamType: row.teamType,
    website: null,
    robot: null,
    sourceUrl: `https://ftc-events.firstinspires.org/${season}/team/${row.number}`,
    summary: null,
    record: null,
    qualificationRecord: null,
    playoffRecord: null,
    events: [],
    awards: [],
    notes: [SUMMARY_ONLY_NOTE],
  };
}

function emptyTeamShell(number: number, latestName: string, regionName: string): Team {
  return {
    number,
    latestName,
    latestLocation: regionName,
    latestCity: null,
    latestState: null,
    latestCountry: null,
    latestRookieYear: null,
    latestOrganization: null,
    latestWebsite: null,
    latestTeamType: 'unknown',
    latestLeague: null,
    latestRegion: regionName,
    links: [],
    seasons: {},
  };
}

function applyLatestFromSeason(team: Team, season: TeamSeason): Team {
  return {
    ...team,
    latestName: season.name,
    latestLocation: season.location,
    latestCity: season.city,
    latestState: season.state,
    latestCountry: season.country,
    latestRookieYear: season.rookieYear ?? team.latestRookieYear,
    latestOrganization: season.organization ?? team.latestOrganization,
    latestWebsite: season.website ?? team.latestWebsite,
    latestTeamType: season.teamType,
    latestLeague: season.league,
    latestRegion: season.region ?? team.latestRegion,
  };
}

/**
 * Build a GeneratedData directory shell from the manifest + region summaries.
 * Does not fetch per-team detail files.
 */
export function buildDirectoryDataFromTree(
  manifest: SnapshotManifest,
  summaries: RegionSeasonSummary[],
): GeneratedData {
  const regionName = manifest.regionLabel ?? regionLabel(manifest.regionCode);
  const teamsByNumber = new Map<number, Team>();

  for (const entry of manifest.teams) {
    teamsByNumber.set(entry.number, emptyTeamShell(entry.number, entry.latestName, regionName));
  }

  const orderedSummaries = [...summaries].sort((a, b) => a.season - b.season);

  for (const summary of orderedSummaries) {
    for (const row of summary.teams) {
      const existing = teamsByNumber.get(row.number) ?? emptyTeamShell(row.number, row.name, regionName);
      const season = summaryOnlySeason(summary.season, row, regionName);
      const withSeason: Team = {
        ...existing,
        seasons: {
          ...existing.seasons,
          [summary.season]: season,
        },
      };
      teamsByNumber.set(row.number, applyLatestFromSeason(withSeason, season));
    }
  }

  const teams = [...teamsByNumber.values()]
    .filter((team) => Object.keys(team.seasons).length > 0)
    .sort((a, b) => a.number - b.number);

  return {
    generatedAt: manifest.generatedAt,
    targetSeasons: [...manifest.seasons],
    regionCode: manifest.regionCode,
    regionLabel: regionName,
    schemaVersion: 1,
    teams,
    regionEvents: [],
    sources: [
      {
        label: 'Static snapshot tree',
        url: '/data/manifest.json',
        note: 'Directory loaded from manifest + region summaries; team detail JSON loads on demand.',
      },
    ],
    limitations: [
      'Team detail (events, awards, and enrichments) loads per team from static JSON when selected.',
      'Live FTC Events refresh runs only when you request it, when a snapshot slice is missing, or when switching to a region without a static tree.',
    ],
  };
}

/** Merge a fully loaded TeamSeason into directory data (replaces summary stubs). */
export function mergeTeamSeasonDetail(
  data: GeneratedData,
  teamNumber: number,
  seasonDetail: TeamSeason,
  indexLatest?: Partial<Team>,
): GeneratedData {
  const season = seasonDetail.season;
  let found = false;

  const teams = data.teams.map((team) => {
    if (team.number !== teamNumber) {
      return team;
    }
    found = true;
    const next: Team = {
      ...team,
      ...(indexLatest ?? {}),
      number: teamNumber,
      links: indexLatest?.links ?? team.links,
      codeRepositories: indexLatest?.codeRepositories ?? team.codeRepositories,
      videoResources: indexLatest?.videoResources ?? team.videoResources,
      seasons: {
        ...team.seasons,
        [season]: {
          ...seasonDetail,
          notes: (seasonDetail.notes ?? []).filter((note) => note !== SUMMARY_ONLY_NOTE),
        },
      },
    };
    return applyLatestFromSeason(next, seasonDetail);
  });

  if (!found) {
    const shell = emptyTeamShell(teamNumber, seasonDetail.name, data.regionLabel ?? regionLabel(data.regionCode));
    const created = applyLatestFromSeason(
      {
        ...shell,
        ...(indexLatest ?? {}),
        number: teamNumber,
        seasons: { [season]: seasonDetail },
      },
      seasonDetail,
    );
    teams.push(created);
    teams.sort((a, b) => a.number - b.number);
  }

  return { ...data, teams };
}

/** Merge a region summary into directory data without fetching team detail files. */
export function mergeRegionSummaryIntoData(
  data: GeneratedData,
  summary: RegionSeasonSummary,
): GeneratedData {
  const regionName = data.regionLabel ?? regionLabel(data.regionCode);
  const teamsByNumber = new Map(data.teams.map((team) => [team.number, team]));

  for (const row of summary.teams) {
    const existing = teamsByNumber.get(row.number) ?? emptyTeamShell(row.number, row.name, regionName);
    const prior = existing.seasons[summary.season];
    if (prior && !isSummaryOnlySeason(prior)) {
      continue;
    }
    const season = summaryOnlySeason(summary.season, row, regionName);
    const withSeason: Team = {
      ...existing,
      seasons: {
        ...existing.seasons,
        [summary.season]: season,
      },
    };
    teamsByNumber.set(row.number, applyLatestFromSeason(withSeason, season));
  }

  const targetSeasons = data.targetSeasons.includes(summary.season)
    ? data.targetSeasons
    : [...data.targetSeasons, summary.season].sort((a, b) => b - a);

  return {
    ...data,
    targetSeasons,
    teams: [...teamsByNumber.values()].sort((a, b) => a.number - b.number),
  };
}
