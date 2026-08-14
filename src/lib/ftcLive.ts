import { GeneratedData, RegionEvent, SeasonId, TARGET_SEASONS, Team, TeamSeason } from '../data/schema';
import { regionLabel as lookupRegionLabel, regionStateProv } from '../data/regions';
import { CACHE_TTL, cacheKey, getCached, seasonTtl, setCached } from './ftcCache';
import { fetchFtcHtml, fetchFtcOk } from './ftcFetch';
import {
  applyLeagueRankings,
  fetchFirstSearchTeams,
  LeagueRanking,
  LeagueSeed,
  mapLimit,
  parseLeagueRankings,
  parseRegionPage,
  parseRegionTitle,
  parseTeamSeason,
  refreshLatestFields,
  RegionTeamSeed,
  seasonFromSeed,
} from './ftcParsers';

const TEAM_REFRESH_CONCURRENCY = 10;

export type LiveRefreshStatus = 'idle' | 'refreshing' | 'error';

export type LiveRefreshProgress = {
  label: string;
  completed: number;
  total: number;
};

export type RegionRefreshOptions = {
  force?: boolean;
  replace?: boolean;
};

function regionEventsMap(regionEvents: RegionEvent[]): Map<string, RegionEvent> {
  return new Map(regionEvents.map((event) => [`${event.season}:${event.code}`, event]));
}

function latestConfiguredSeason(_data?: GeneratedData): SeasonId {
  // Prefer the app's configured current season, not a stale seed targetSeasons[0].
  return TARGET_SEASONS[0];
}

export function seasonHasTeamData(data: GeneratedData, season: SeasonId): boolean {
  return data.teams.some((team) => Boolean(team.seasons?.[season]));
}

function mergeRegionEvents(existing: RegionEvent[], incoming: RegionEvent[]): RegionEvent[] {
  const merged = new Map(existing.map((event) => [`${event.season}:${event.code}`, event]));

  for (const event of incoming) {
    merged.set(`${event.season}:${event.code}`, event);
  }

  return [...merged.values()].sort((a, b) => b.season - a.season || a.code.localeCompare(b.code));
}

function upsertTeamSeason(teams: Team[], teamNumber: number, season: TeamSeason): Team[] {
  const nextTeams = teams.map((team) => {
    if (team.number !== teamNumber) {
      return team;
    }

    return refreshLatestFields({
      ...team,
      seasons: {
        ...team.seasons,
        [season.season]: season,
      },
    });
  });

  if (nextTeams.some((team) => team.number === teamNumber)) {
    return nextTeams.sort((a, b) => a.number - b.number);
  }

  return [
    ...nextTeams,
    refreshLatestFields({
      number: teamNumber,
      latestName: season.name,
      latestLocation: season.location,
      latestCity: season.city,
      latestState: season.state,
      latestCountry: season.country,
      latestRookieYear: season.rookieYear,
      latestOrganization: season.organization,
      latestWebsite: season.website,
      latestTeamType: season.teamType,
      latestLeague: season.league,
      latestRegion: season.region,
      links: [],
      seasons: {
        [season.season]: season,
      },
    }),
  ].sort((a, b) => a.number - b.number);
}

function seedFromTeam(
  team: Team | undefined,
  season: SeasonId,
  number: number,
  regionCode: string,
): RegionTeamSeed {
  const existingSeason = team?.seasons[season];
  const label = lookupRegionLabel(regionCode);
  const state = regionStateProv(regionCode);

  return {
    season,
    number,
    name: existingSeason?.name ?? team?.latestName ?? `Team ${number}`,
    location: existingSeason?.location ?? team?.latestLocation ?? label,
    city: existingSeason?.city ?? team?.latestCity ?? null,
    state: existingSeason?.state ?? team?.latestState ?? state,
    country: existingSeason?.country ?? team?.latestCountry ?? 'USA',
    rookieYear: existingSeason?.rookieYear ?? team?.latestRookieYear ?? null,
    organization: existingSeason?.organization ?? team?.latestOrganization ?? null,
    sourceUrl: existingSeason?.sourceUrl ?? `https://ftc-events.firstinspires.org/${season}/team/${number}`,
    seedSource: 'ftc-events',
  };
}

export function createEmptyRegionData(regionCode: string, regionName?: string): GeneratedData {
  return {
    generatedAt: new Date().toISOString(),
    targetSeasons: [...TARGET_SEASONS],
    regionCode,
    regionLabel: regionName ?? lookupRegionLabel(regionCode),
    teams: [],
    regionEvents: [],
    sources: [],
    limitations: [
      'Select Refresh season after switching regions to load team events, awards, and analytics for the new region.',
    ],
  };
}

export async function refreshRegionSeason(
  data: GeneratedData,
  season: SeasonId,
  options?: RegionRefreshOptions,
): Promise<{
  teams: Team[];
  regionEvents: RegionEvent[];
  leagues: LeagueSeed[];
  seeds: RegionTeamSeed[];
  regionLabel: string;
}> {
  const regionCode = data.regionCode;
  const latestSeason = latestConfiguredSeason(data);
  const regionCacheKey = cacheKey('region', regionCode, String(season));
  const ttl = seasonTtl(
    season,
    latestSeason,
    CACHE_TTL.currentSeasonRegionMs,
    CACHE_TTL.olderSeasonRegionMs,
  );
  const regionName = lookupRegionLabel(regionCode);

  if (!options?.force) {
    const cached = getCached<{
      teams: RegionTeamSeed[];
      regionEvents: RegionEvent[];
      leagues: LeagueSeed[];
      regionLabel?: string;
    }>(regionCacheKey, ttl);

    if (cached) {
      let teams = options?.replace ? [] : data.teams;

      for (const seed of cached.teams) {
        const existing = teams.find((team) => team.number === seed.number);
        const seasonData =
          existing?.seasons[season] ??
          seasonFromSeed(seed, 'Region roster refreshed from cached FTC Events page.', cached.regionLabel ?? regionName);

        teams = upsertTeamSeason(teams, seed.number, {
          ...seasonData,
          name: seed.name,
          location: seed.location,
          city: seed.city,
          state: seed.state,
          country: seed.country,
          rookieYear: seed.rookieYear ?? seasonData.rookieYear,
          sourceUrl: seed.sourceUrl,
        });
      }

      return {
        teams,
        regionEvents: options?.replace ? cached.regionEvents : mergeRegionEvents(data.regionEvents, cached.regionEvents),
        leagues: cached.leagues,
        seeds: cached.teams,
        regionLabel: cached.regionLabel ?? regionName,
      };
    }
  }

  let html: string;
  let parsed: ReturnType<typeof parseRegionPage>;
  let resolvedRegionLabel = regionName;

  try {
    html = await fetchFtcHtml(`/${season}/region/${regionCode}`);
    parsed = parseRegionPage(season, html, regionCode);
    resolvedRegionLabel = parseRegionTitle(html) ?? regionName;
  } catch (error) {
    const stateProv = regionStateProv(regionCode);

    if (!stateProv) {
      throw error;
    }

    const searchTeams = await fetchFirstSearchTeams(season, stateProv);
    parsed = {
      teams: searchTeams,
      events: [],
      leagues: [],
    };
    resolvedRegionLabel = `${regionName} (FIRST Team Search)`;
  }

  setCached(regionCacheKey, {
    teams: parsed.teams,
    regionEvents: parsed.events,
    leagues: parsed.leagues,
    regionLabel: resolvedRegionLabel,
  });

  let teams = options?.replace ? [] : data.teams;

  for (const seed of parsed.teams) {
    const existing = teams.find((team) => team.number === seed.number);
    const seasonData =
      existing?.seasons[season] ??
      seasonFromSeed(seed, 'Region roster refreshed from live FTC Events page.', resolvedRegionLabel);

    teams = upsertTeamSeason(teams, seed.number, {
      ...seasonData,
      name: seed.name,
      location: seed.location,
      city: seed.city,
      state: seed.state,
      country: seed.country,
      rookieYear: seed.rookieYear ?? seasonData.rookieYear,
      sourceUrl: seed.sourceUrl,
    });
  }

  return {
    teams,
    regionEvents: options?.replace ? parsed.events : mergeRegionEvents(data.regionEvents, parsed.events),
    leagues: parsed.leagues,
    seeds: parsed.teams,
    regionLabel: resolvedRegionLabel,
  };
}

export async function refreshTeamAllSeasonsLive(
  data: GeneratedData,
  teamNumber: number,
  onProgress?: (progress: LiveRefreshProgress) => void,
  options?: { force?: boolean },
): Promise<TeamSeason[]> {
  const seasons = data.targetSeasons.length > 0 ? data.targetSeasons : [...TARGET_SEASONS];
  const availableSeasons: SeasonId[] = [];

  for (const season of seasons) {
    if (await fetchFtcOk(`/${season}/team/${teamNumber}`)) {
      availableSeasons.push(season);
    }
  }

  const results: TeamSeason[] = [];
  let completed = 0;

  for (const season of availableSeasons) {
    const seasonData = await refreshTeamSeasonLive(data, season, teamNumber, options);
    results.push(seasonData);
    completed += 1;
    onProgress?.({
      label: `Refreshing team ${teamNumber} (${season})`,
      completed,
      total: availableSeasons.length,
    });
  }

  return results;
}

export async function refreshTeamSeasonLive(
  data: GeneratedData,
  season: SeasonId,
  teamNumber: number,
  options?: { force?: boolean },
): Promise<TeamSeason> {
  const latestSeason = latestConfiguredSeason(data);
  const teamCacheKey = cacheKey('team', data.regionCode, String(season), String(teamNumber));
  const ttl = seasonTtl(season, latestSeason, CACHE_TTL.currentSeasonTeamMs, CACHE_TTL.olderSeasonTeamMs);
  const regionName = data.regionLabel ?? lookupRegionLabel(data.regionCode);

  if (!options?.force) {
    const cached = getCached<TeamSeason>(teamCacheKey, ttl);

    if (cached) {
      return cached;
    }
  }

  const team = data.teams.find((entry) => entry.number === teamNumber);
  const seed = seedFromTeam(team, season, teamNumber, data.regionCode);
  const regionEvents = regionEventsMap(data.regionEvents);

  try {
    const html = await fetchFtcHtml(`/${season}/team/${teamNumber}`);
    const parsedSeason = parseTeamSeason(seed, html, regionEvents);
    setCached(teamCacheKey, parsedSeason);
    return parsedSeason;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return seasonFromSeed(seed, `Could not refresh public team page: ${message}`, regionName);
  }
}

export async function refreshSeasonDetails(
  data: GeneratedData,
  season: SeasonId,
  onProgress?: (progress: LiveRefreshProgress) => void,
  options?: RegionRefreshOptions,
): Promise<GeneratedData> {
  const regionResult = await refreshRegionSeason(data, season, options);
  const leagueRankings = new Map<string, LeagueRanking>();
  const regionEvents = regionEventsMap(regionResult.regionEvents);

  for (const league of regionResult.leagues) {
    try {
      const leaguePath = new URL(league.sourceUrl).pathname;
      const html = await fetchFtcHtml(leaguePath);
      const rankings = parseLeagueRankings(league.season, league.name, html);

      for (const ranking of rankings) {
        leagueRankings.set(`${ranking.season}:${ranking.league}:${ranking.teamNumber}`, ranking);
      }
    } catch {
      // League rankings are optional; keep going.
    }
  }

  let teams = regionResult.teams;
  const seeds = regionResult.seeds;
  let completed = 0;
  const refreshContext = {
    ...data,
    teams: regionResult.teams,
    regionEvents: regionResult.regionEvents,
    regionLabel: regionResult.regionLabel,
  };

  const teamSeasons = await mapLimit(seeds, TEAM_REFRESH_CONCURRENCY, async (seed) => {
    const seasonData = await refreshTeamSeasonLive(refreshContext, season, seed.number, options);

    completed += 1;
    onProgress?.({
      label: `Refreshing team ${seed.number}`,
      completed,
      total: seeds.length,
    });

    return { number: seed.number, seasonData };
  });

  for (const { number, seasonData } of teamSeasons) {
    teams = upsertTeamSeason(teams, number, seasonData);
  }

  applyLeagueRankings(teams, regionEvents, leagueRankings);

  return {
    ...data,
    generatedAt: data.generatedAt,
    liveRefreshedAt: new Date().toISOString(),
    regionLabel: regionResult.regionLabel,
    teams,
    regionEvents: regionResult.regionEvents,
  };
}

export function shouldAutoRefreshRegion(season: SeasonId, data: GeneratedData): boolean {
  // Empty season datasets (e.g. seed still on DECODE while BIOBUZZ is published) must pull.
  if (!seasonHasTeamData(data, season)) {
    return true;
  }

  const latestSeason = latestConfiguredSeason(data);
  const regionCacheKey = cacheKey('region', data.regionCode, String(season));
  const ttl = seasonTtl(
    season,
    latestSeason,
    CACHE_TTL.currentSeasonRegionMs,
    CACHE_TTL.olderSeasonRegionMs,
  );

  return getCached(regionCacheKey, ttl) === null;
}
