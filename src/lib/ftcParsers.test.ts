import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RegionEvent } from '../data/schema';
import {
  BASE_URL,
  parseFirstSearchTeams,
  parseLeagueRankings,
  parseLocation,
  parseRegionPage,
  parseTeamSeason,
  RegionTeamSeed,
} from './ftcParsers';

const FIXTURES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const SEASON = 2025 as const;
const REGION_CODE = 'USNV';
const TEAM_NUMBER = 21535;

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), 'utf8');
}

const TEAM_SEED: RegionTeamSeed = {
  season: SEASON,
  number: TEAM_NUMBER,
  name: 'Royal Ghostbusters',
  location: 'Las Vegas, NV, USA',
  city: 'Las Vegas',
  state: 'NV',
  country: 'USA',
  rookieYear: 2022,
  organization: null,
  sourceUrl: `${BASE_URL}/${SEASON}/team/${TEAM_NUMBER}`,
  seedSource: 'ftc-events',
};

const REGION_EVENTS = new Map<string, RegionEvent>([
  [
    `${SEASON}:USNVSNM1`,
    {
      season: SEASON,
      code: 'USNVSNM1',
      name: 'NV Southern League Meet # 1S',
      league: 'Southern Nevada',
      location: 'Las Vegas, NV, USA',
      date: '12/07/25',
      sourceUrl: `${BASE_URL}/${SEASON}/USNVSNM1`,
    },
  ],
  [
    `${SEASON}:USNVCMP`,
    {
      season: SEASON,
      code: 'USNVCMP',
      name: 'Nevada Championship',
      league: null,
      location: 'Las Vegas, NV, USA',
      date: '2/21/25 - 2/22/25',
      sourceUrl: `${BASE_URL}/${SEASON}/USNVCMP`,
    },
  ],
]);

describe('parseLocation', () => {
  it('splits city, state, and country on commas', () => {
    expect(parseLocation('Las Vegas, NV, USA')).toEqual({
      city: 'Las Vegas',
      state: 'NV',
      country: 'USA',
    });
  });

  it('leaves country null when only city and state are present', () => {
    expect(parseLocation('Reno, NV')).toEqual({
      city: 'Reno',
      state: 'NV',
      country: null,
    });
  });
});

describe('parseRegionPage', () => {
  const html = loadFixture('region-usnv-2025.html');

  it('contains the team, league, and event href markers the parser requires', () => {
    expect(html).toMatch(/\/2025\/team\/\d+/);
    expect(html).toMatch(/\/2025\/region\/USNV\/league\/[A-Z0-9]+/);
    expect(html).toMatch(/\/2025\/[A-Z][A-Z0-9]+"/);
  });

  it('parses public team, league, and event rows', () => {
    const parsed = parseRegionPage(SEASON, html, REGION_CODE);

    expect(parsed.teams).toEqual([
      {
        season: SEASON,
        number: 12777,
        name: 'Boulder City SuperBots',
        location: 'Boulder City, NV, USA',
        city: 'Boulder City',
        state: 'NV',
        country: 'USA',
        rookieYear: 2017,
        organization: null,
        sourceUrl: `${BASE_URL}/${SEASON}/team/12777`,
        seedSource: 'ftc-events',
      },
      {
        season: SEASON,
        number: 21535,
        name: 'Royal Ghostbusters',
        location: 'Las Vegas, NV, USA',
        city: 'Las Vegas',
        state: 'NV',
        country: 'USA',
        rookieYear: 2022,
        organization: null,
        sourceUrl: `${BASE_URL}/${SEASON}/team/21535`,
        seedSource: 'ftc-events',
      },
    ]);

    expect(parsed.leagues).toEqual([
      {
        season: SEASON,
        name: 'Southern Nevada',
        sourceUrl: `${BASE_URL}/${SEASON}/region/${REGION_CODE}/league/NVSN`,
      },
    ]);

    expect(parsed.events.map((event) => event.code)).toEqual(['USNVCMP', 'USNVSNM1']);
    expect(parsed.events).toEqual([
      {
        season: SEASON,
        code: 'USNVCMP',
        name: 'Nevada Championship',
        league: null,
        location: 'Las Vegas, NV, USA',
        date: '2/21/25 - 2/22/25',
        sourceUrl: `${BASE_URL}/${SEASON}/USNVCMP`,
      },
      {
        season: SEASON,
        code: 'USNVSNM1',
        name: 'NV Southern League Meet # 1S',
        league: 'Southern Nevada',
        location: 'Las Vegas, NV, USA',
        date: '12/07/25',
        sourceUrl: `${BASE_URL}/${SEASON}/USNVSNM1`,
      },
    ]);
  });

  it('returns no teams when /{season}/team/ hrefs disappear', () => {
    const stripped = html.replaceAll('/2025/team/', '/2025/roster/');
    expect(parseRegionPage(SEASON, stripped, REGION_CODE).teams).toEqual([]);
  });
});

describe('parseLeagueRankings', () => {
  const html = loadFixture('league-southern-2025.html');

  it('contains Rank, Team, and RS headers plus seven data cells', () => {
    expect(html).toMatch(/<th>\s*Rank\s*<\/th>/i);
    expect(html).toMatch(/<th>\s*Team\s*<\/th>/i);
    expect(html).toMatch(/<th>\s*RS\s*<\/th>/i);
    expect(html).toMatch(/<tr>\s*(<td>[\s\S]*?<\/td>\s*){7}<\/tr>/);
  });

  it('parses rank, ranking score, match points, and plays', () => {
    expect(parseLeagueRankings(SEASON, 'Southern Nevada', html)).toEqual([
      {
        season: SEASON,
        league: 'Southern Nevada',
        teamNumber: 12777,
        rank: 1,
        rankingScore: 2.5,
        matchPoints: 120,
        plays: 10,
      },
      {
        season: SEASON,
        league: 'Southern Nevada',
        teamNumber: 21535,
        rank: 2,
        rankingScore: 1.75,
        matchPoints: 90,
        plays: 8,
      },
    ]);
  });

  it('returns no rankings when the RS header disappears', () => {
    const stripped = html.replace('<th>RS</th>', '<th>Score</th>');
    expect(parseLeagueRankings(SEASON, 'Southern Nevada', stripped)).toEqual([]);
  });
});

describe('parseTeamSeason', () => {
  const html = loadFixture('team-21535-2025.html');

  it('contains the heading, label, qualification, tab-pane, and award markers', () => {
    expect(html).toContain('Team 21535 - Royal Ghostbusters (2025)');
    expect(html).toContain('From:');
    expect(html).toContain('/2025/USNVSNM1/qualifications?team=21535');
    expect(html).toMatch(/class="tab-pane"[^>]*id="USNVCMP"/);
    expect(html).toMatch(/<th>\s*Award\s*<\/th>/i);
    expect(html).toMatch(/<th>\s*Event\s*<\/th>/i);
    expect(html).toContain('class="danger"');
    expect(html).toContain('class="info"');
  });

  it('parses identity fields, records, events, match points, and awards', () => {
    const season = parseTeamSeason(TEAM_SEED, html, REGION_EVENTS);
    const meet = season.events.find((event) => event.code === 'USNVSNM1');
    const championship = season.events.find((event) => event.code === 'USNVCMP');

    expect(season.name).toBe('Royal Ghostbusters');
    expect(season.location).toBe('Las Vegas, NV, USA');
    expect(season.city).toBe('Las Vegas');
    expect(season.state).toBe('NV');
    expect(season.country).toBe('USA');
    expect(season.region).toBe('Nevada');
    expect(season.league).toBe('Southern Nevada');
    expect(season.rookieYear).toBe(2022);
    expect(season.organization).toBe('Tesla&Helen C Cannon Middle School');
    expect(season.affiliations).toEqual([
      expect.objectContaining({
        entityType: 'sponsor',
        name: 'Tesla',
        sourceText: 'Tesla&Helen C Cannon Middle School',
        confidence: 'high',
        confirmationState: 'unconfirmed',
        source: 'ftc-events-sponsors',
      }),
      expect.objectContaining({
        entityType: 'school',
        name: 'Helen C Cannon Middle School',
        sourceText: 'Tesla&Helen C Cannon Middle School',
      }),
    ]);
    expect(season.teamType).toBe('school');
    expect(season.website).toBe('https://www.firstinspires.org');
    expect(season.robot).toBe('Phantom');
    expect(season.summary).toContain('Team 21535 had a record of 6-4-0');
    expect(season.record).toEqual({ wins: 6, losses: 4, ties: 0, text: '6-4-0' });
    expect(season.qualificationRecord).toEqual({ wins: 5, losses: 3, ties: 0, text: '5-3-0' });
    expect(season.playoffRecord).toBeNull();
    expect(season.notes).toEqual([]);

    expect(meet).toMatchObject({
      code: 'USNVSNM1',
      name: 'NV Southern League Meet # 1S',
      dateRange: 'December 07 to December 07, 2025',
      location: 'Las Vegas, NV, USA',
      league: 'Southern Nevada',
      rank: '4 of 12',
      totalPoints: 100,
      matchCount: 2,
      qualificationUrl: `${BASE_URL}/${SEASON}/USNVSNM1/qualifications?team=${TEAM_NUMBER}`,
      playoffUrl: `${BASE_URL}/${SEASON}/USNVSNM1/playoffs?team=${TEAM_NUMBER}`,
      playoffRecord: '2 Wins and 1 Losses',
      allianceSelection: 'Captain',
      sourceUrl: `${BASE_URL}/${SEASON}/USNVSNM1`,
    });

    expect(championship).toMatchObject({
      code: 'USNVCMP',
      name: 'Nevada Championship',
      dateRange: 'February 21 to February 22, 2025',
      location: 'Las Vegas, NV, USA',
      league: null,
      rank: '14 of 23',
      totalPoints: null,
      matchCount: 0,
      qualificationUrl: null,
      playoffUrl: null,
      sourceUrl: `${BASE_URL}/${SEASON}/USNVCMP`,
    });

    expect(season.awards).toEqual([
      {
        name: 'Winning Alliance - Captain',
        awardType: 'Winning Alliance',
        eventName: 'NV Southern League Meet # 1S',
        eventCode: 'USNVSNM1',
        awardUrl: `${BASE_URL}/${SEASON}/awards?id=13`,
        eventUrl: `${BASE_URL}/${SEASON}/USNVSNM1`,
      },
      {
        name: 'Think Award 2nd Place',
        awardType: 'Think Award',
        eventName: 'Nevada Championship',
        eventCode: 'USNVCMP',
        awardUrl: `${BASE_URL}/${SEASON}/awards?id=9`,
        eventUrl: `${BASE_URL}/${SEASON}/USNVCMP`,
      },
    ]);
  });

  it('falls back to the seed location when From: disappears', () => {
    const stripped = html.replace('From:', 'Hometown:');
    const season = parseTeamSeason(
      { ...TEAM_SEED, location: 'Sparks, NV, USA', city: 'Sparks', state: 'NV', country: 'USA' },
      stripped,
      REGION_EVENTS,
    );

    expect(season.location).toBe('Sparks, NV, USA');
    expect(season.city).toBe('Sparks');
  });

  it('records a note and no events when qualification links and tab panes disappear', () => {
    const stripped = html
      .replaceAll('/qualifications?team=', '/matches?team=')
      .replaceAll('class="tab-pane"', 'class="pane"');
    const season = parseTeamSeason(TEAM_SEED, stripped, REGION_EVENTS);

    expect(season.events).toEqual([]);
    expect(season.notes).toEqual(['No public event rows were parsed from this season page.']);
  });

  it('returns no awards when Award and Event headers disappear', () => {
    const stripped = html.replace('<th>Award</th>', '<th>Honor</th>').replace('<th>Event</th>', '<th>Contest</th>');
    expect(parseTeamSeason(TEAM_SEED, stripped, REGION_EVENTS).awards).toEqual([]);
  });
});

describe('parseFirstSearchTeams', () => {
  const payload = JSON.parse(loadFixture('first-search-nv.json')) as unknown;

  it('maps valid hits, skips incomplete rows, and collapses duplicate team numbers', () => {
    const teams = parseFirstSearchTeams(SEASON, payload);

    expect(teams).toHaveLength(2);
    expect(teams.map((team) => team.number)).toEqual([12777, 21535]);
    expect(teams[0]).toMatchObject({
      season: SEASON,
      number: 12777,
      name: 'Boulder City SuperBots',
      location: 'Boulder City, NV, USA',
      city: 'Boulder City',
      state: 'NV',
      country: 'USA',
      rookieYear: 2017,
      organization: 'University of Nevada Cooperative Extension/TESLA&4-H Youth Development Organization',
      sourceUrl: `${BASE_URL}/${SEASON}/team/12777`,
      seedSource: 'first-search',
    });
    expect(teams[1]).toMatchObject({
      number: 21535,
      name: 'Royal Ghostbusters',
      seedSource: 'first-search',
      organization: 'Tesla&Helen C Cannon Middle School',
    });
  });

  it('returns an empty list when results are missing or empty', () => {
    expect(parseFirstSearchTeams(SEASON, { results: [] })).toEqual([]);
    expect(parseFirstSearchTeams(SEASON, {})).toEqual([]);
    expect(parseFirstSearchTeams(SEASON, null)).toEqual([]);
  });
});
