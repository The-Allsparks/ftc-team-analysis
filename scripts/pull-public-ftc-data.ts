import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSafeToPublishGeneratedData } from '../src/data/publishGuard';
import { GeneratedData, RegionEvent, SeasonId, TARGET_SEASONS, Team, TeamLink, TeamSeason } from '../src/data/schema';
import {
  applyLeagueRankings,
  BASE_URL,
  discoverLinksForWebsite,
  fetchFirstSearchTeams,
  fetchHtml,
  LeagueRanking,
  LeagueSeed,
  mapLimit,
  mergeSeason,
  normalizeExternalUrl,
  parseLeagueRankings,
  parseRegionPage,
  parseTeamSeason,
  refreshLatestFields,
  RegionTeamSeed,
  REGION_CODE,
  seasonFromSeed,
  sleep,
} from '../src/lib/ftcParsers';

const TEAM_SEARCH_URL = `https://www.firstinspires.org/team-event-search?content=teams&season=${TARGET_SEASONS[0]}&country=United+States&state=NV&programs=FIRST+Tech+Challenge&indices=teams_*`;
const GENERATED_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../src/data/nv-ftc-teams.generated.json',
);

async function enrichTeamLinks(teams: Team[]): Promise<void> {
  await mapLimit(teams, 4, async (team) => {
    const websites = [
      ...new Set(
        (Object.values(team.seasons) as TeamSeason[])
          .map((season) => normalizeExternalUrl(season.website))
          .filter((url): url is string => Boolean(url)),
      ),
    ];
    const links = new Map<string, TeamLink>();

    for (const website of websites) {
      const discoveredLinks = await discoverLinksForWebsite(website, team);

      for (const link of discoveredLinks) {
        links.set(link.url, link);
      }
    }

    team.links = [...links.values()].sort(
      (a, b) =>
        ({
          website: 0,
          code: 1,
          cad: 2,
          video: 3,
          social: 4,
          community: 5,
          docs: 6,
          'link-hub': 7,
          other: 8,
        })[a.type] -
          ({
            website: 0,
            code: 1,
            cad: 2,
            video: 3,
            social: 4,
            community: 5,
            docs: 6,
            'link-hub': 7,
            other: 8,
          })[b.type] || a.label.localeCompare(b.label),
    );
  });
}

async function main() {
  const regionEvents = new Map<string, RegionEvent>();
  const leagueSeeds = new Map<string, LeagueSeed>();
  const seeds: RegionTeamSeed[] = [];

  const availableSeasons: SeasonId[] = [];

  for (const season of TARGET_SEASONS) {
    const url = `${BASE_URL}/${season}/region/${REGION_CODE}`;
    console.log(`Pulling ${url}`);

    try {
      const html = await fetchHtml(url);
      const parsed = parseRegionPage(season, html, REGION_CODE);
      availableSeasons.push(season);
      seeds.push(...parsed.teams);

      for (const event of parsed.events) {
        regionEvents.set(`${season}:${event.code}`, event);
      }

      for (const league of parsed.leagues) {
        leagueSeeds.set(`${league.season}:${league.name}`, league);
      }

      console.log(`  ${parsed.teams.length} teams, ${parsed.events.length} Nevada events, ${parsed.leagues.length} leagues`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`  FTC Events region unavailable for ${season}: ${message}`);

      try {
        console.log(`  Trying FIRST Team Search for ${season}`);
        const searchTeams = await fetchFirstSearchTeams(season, REGION_CODE.slice(2));

        if (searchTeams.length === 0) {
          console.warn(`  no Nevada FTC teams found in FIRST Team Search for ${season}`);
          continue;
        }

        availableSeasons.push(season);
        seeds.push(...searchTeams);
        console.log(`  ${searchTeams.length} teams from FIRST Team Search`);
      } catch (searchError) {
        const searchMessage = searchError instanceof Error ? searchError.message : String(searchError);
        console.warn(`  FIRST Team Search failed for ${season}: ${searchMessage}`);
      }
    }
  }

  if (availableSeasons.length === 0) {
    throw new Error('No public FTC Events region pages were available for the configured seasons.');
  }

  const leagueRankings = new Map<string, LeagueRanking>();

  for (const league of leagueSeeds.values()) {
    console.log(`Pulling ${league.sourceUrl}#rankings`);
    let rankings: LeagueRanking[] = [];

    try {
      const html = await fetchHtml(league.sourceUrl);
      rankings = parseLeagueRankings(league.season, league.name, html);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`  skipped league rankings: ${message}`);
    }

    for (const ranking of rankings) {
      leagueRankings.set(`${ranking.season}:${ranking.league}:${ranking.teamNumber}`, ranking);
    }

    console.log(`  ${rankings.length} official league rankings`);
  }

  const teamMap = new Map<number, Team>();

  await mapLimit(seeds, 5, async (seed, index) => {
    await sleep(index % 5 === 0 ? 250 : 0);

    try {
      const html = await fetchHtml(seed.sourceUrl);
      const season = parseTeamSeason(seed, html, regionEvents);
      mergeSeason(teamMap, seed.number, season);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      mergeSeason(teamMap, seed.number, seasonFromSeed(seed, `Could not pull public team page: ${message}`, 'Nevada'));
    }
  });

  const teams = [...teamMap.values()].map(refreshLatestFields).sort((a, b) => a.number - b.number);
  applyLeagueRankings(teams, regionEvents, leagueRankings);
  console.log('Discovering team website and social/code links');
  await enrichTeamLinks(teams);

  const seasonsWithData = [
    ...new Set(
      teams.flatMap((team) => Object.keys(team.seasons).map((season) => Number(season) as SeasonId)),
    ),
  ].sort((a, b) => b - a);

  const data: GeneratedData = {
    generatedAt: new Date().toISOString(),
    targetSeasons: seasonsWithData,
    regionCode: REGION_CODE,
    teams,
    regionEvents: [...regionEvents.values()].sort((a, b) => b.season - a.season || a.code.localeCompare(b.code)),
    sources: [
      {
        label: 'FIRST Team/Event Search',
        url: TEAM_SEARCH_URL,
        note: 'Public search index used as a registration seed when FTC Events Nevada region pages are not yet published for a season.',
      },
      {
        label: 'FTC Events Nevada Region Pages',
        url: `${BASE_URL}/2025/region/${REGION_CODE}`,
        note: 'Public region pages provide team numbers, names, locations, rookie years, and Nevada event lists by season.',
      },
      {
        label: 'FTC Events Public Team Pages',
        url: `${BASE_URL}/2025/team/16158`,
        note: 'Public team pages provide event participation, records visible on the page, sponsors/organization text, and awards.',
      },
      {
        label: 'FTC Events API Information',
        url: `${BASE_URL}/services/API`,
        note: 'The authenticated API remains the better source for complete structured data, but this project is public-only for now.',
      },
    ],
    limitations: [
      'FIRST Team/Event Search is used as a registration seed when FTC Events Nevada region pages are unavailable for a season.',
      'Organization is parsed from the public season sponsor line when available because the authenticated team API is not being used.',
      'Organization strings are also split into typed affiliations (school, sponsors, community/host) with confidence flags; the raw organization text is retained. Ambiguous parses stay unconfirmed/low confidence.',
      'Core season facts support optional per-field evidence written by live refresh and pull:data. The checked-in seed may omit evidence arrays; the UI derives display provenance on read from season scalars and sourceUrl. Organization affiliations remain a parallel model.',
      'Match-level details are limited to what appears on public team pages. The script stores event participation, ranks, records, playoff summaries, awards, per-event points, and official league RS/rank where visible.',
      'External team links are discovered from public FTC On The Web URLs and one crawl of each team website, so private or unlinked accounts will not appear.',
    ],
  };

  await mkdir(dirname(GENERATED_PATH), { recursive: true });

  let previous: unknown = null;
  try {
    previous = JSON.parse(await readFile(GENERATED_PATH, 'utf8'));
  } catch {
    previous = null;
  }

  assertSafeToPublishGeneratedData(previous, data);
  await writeFile(GENERATED_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${data.teams.length} teams to ${GENERATED_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
