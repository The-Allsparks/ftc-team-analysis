import { describe, expect, it } from 'vitest';
import { SeasonId, Team, TeamSeason } from './data/schema';
import { buildTeamLineageMap, getTeamLineage } from './teamLineage';

function makeSeason(
  season: SeasonId,
  overrides: Partial<TeamSeason> & Pick<TeamSeason, 'name' | 'organization' | 'teamType'>,
): TeamSeason {
  return {
    season,
    active: true,
    location: 'Las Vegas, NV, USA',
    city: 'Las Vegas',
    state: 'NV',
    country: 'USA',
    region: 'Nevada',
    league: null,
    rookieYear: 2020,
    website: null,
    robot: null,
    sourceUrl: `https://ftc-events.firstinspires.org/${season}/team/1`,
    summary: null,
    record: null,
    qualificationRecord: null,
    playoffRecord: null,
    events: [],
    awards: [],
    notes: [],
    ...overrides,
  };
}

function makeTeam(
  number: number,
  seasons: TeamSeason[],
  latestName = seasons[seasons.length - 1]?.name ?? `Team ${number}`,
): Team {
  const seasonMap = Object.fromEntries(seasons.map((season) => [season.season, season])) as Team['seasons'];
  const latest = seasons[seasons.length - 1];

  return {
    number,
    latestName,
    latestLocation: latest?.location ?? 'Las Vegas, NV, USA',
    latestCity: latest?.city ?? 'Las Vegas',
    latestState: latest?.state ?? 'NV',
    latestCountry: latest?.country ?? 'USA',
    latestRookieYear: latest?.rookieYear ?? 2020,
    latestOrganization: latest?.organization ?? null,
    latestWebsite: null,
    latestTeamType: latest?.teamType ?? 'unknown',
    latestLeague: null,
    latestRegion: 'Nevada',
    links: [],
    seasons: seasonMap,
  };
}

describe('buildTeamLineageMap', () => {
  it('links school teams that share a school org across non-overlapping seasons', () => {
    const prior = makeTeam(1001, [
      makeSeason(2022, {
        name: 'Cannon Bots',
        organization: 'Helen C Cannon Middle School',
        teamType: 'school',
      }),
    ]);
    const successor = makeTeam(1002, [
      makeSeason(2024, {
        name: 'Cannon Robotics',
        organization: 'Helen C Cannon Middle School',
        teamType: 'school',
      }),
    ]);

    const lineage = buildTeamLineageMap([prior, successor]);

    expect(getTeamLineage(lineage, 1002).priorTeams).toEqual([
      expect.objectContaining({
        teamNumber: 1001,
        confidence: expect.stringMatching(/^(high|medium)$/),
      }),
    ]);
    expect(getTeamLineage(lineage, 1001).successorTeams).toEqual([
      expect.objectContaining({ teamNumber: 1002 }),
    ]);
  });

  it('does not treat shared generic org segments (Tesla) as succession', () => {
    const prior = makeTeam(2001, [
      makeSeason(2022, {
        name: 'Alpha Bots',
        organization: 'Tesla',
        teamType: 'school',
        city: 'Las Vegas',
      }),
    ]);
    const successor = makeTeam(2002, [
      makeSeason(2024, {
        name: 'Beta Bots',
        organization: 'Tesla',
        teamType: 'school',
        city: 'Las Vegas',
      }),
    ]);

    const lineage = buildTeamLineageMap([prior, successor]);

    expect(getTeamLineage(lineage, 2001).priorTeams).toEqual([]);
    expect(getTeamLineage(lineage, 2001).successorTeams).toEqual([]);
    expect(getTeamLineage(lineage, 2002).priorTeams).toEqual([]);
    expect(getTeamLineage(lineage, 2002).successorTeams).toEqual([]);
  });

  it('does not treat shared goBILDA / community generic keys as succession', () => {
    const prior = makeTeam(3001, [
      makeSeason(2021, {
        name: 'Gear Cats',
        organization: 'goBILDA / Community Robotics',
        teamType: 'non-school',
      }),
    ]);
    const successor = makeTeam(3002, [
      makeSeason(2023, {
        name: 'Gear Dogs',
        organization: 'gobilda, community',
        teamType: 'non-school',
      }),
    ]);

    const lineage = buildTeamLineageMap([prior, successor]);

    expect(getTeamLineage(lineage, 3001).successorTeams).toEqual([]);
    expect(getTeamLineage(lineage, 3002).priorTeams).toEqual([]);
  });

  it('does not link teams with overlapping seasons', () => {
    const teamA = makeTeam(4001, [
      makeSeason(2023, {
        name: 'Shared School A',
        organization: 'Desert Pines High School',
        teamType: 'school',
      }),
      makeSeason(2024, {
        name: 'Shared School A',
        organization: 'Desert Pines High School',
        teamType: 'school',
      }),
    ]);
    const teamB = makeTeam(4002, [
      makeSeason(2024, {
        name: 'Shared School B',
        organization: 'Desert Pines High School',
        teamType: 'school',
      }),
    ]);

    const lineage = buildTeamLineageMap([teamA, teamB]);

    expect(getTeamLineage(lineage, 4001).successorTeams).toEqual([]);
    expect(getTeamLineage(lineage, 4002).priorTeams).toEqual([]);
  });

  it('does not link teams with different school keys', () => {
    const prior = makeTeam(5001, [
      makeSeason(2022, {
        name: 'West Side',
        organization: 'Palo Verde High School',
        teamType: 'school',
      }),
    ]);
    const successor = makeTeam(5002, [
      makeSeason(2024, {
        name: 'East Side',
        organization: 'Basic Academy High School',
        teamType: 'school',
      }),
    ]);

    const lineage = buildTeamLineageMap([prior, successor]);

    expect(getTeamLineage(lineage, 5001).successorTeams).toEqual([]);
    expect(getTeamLineage(lineage, 5002).priorTeams).toEqual([]);
  });
});

describe('getTeamLineage', () => {
  it('returns empty prior and successor lists for an unknown team number', () => {
    const lineage = buildTeamLineageMap([]);
    expect(getTeamLineage(lineage, 99999)).toEqual({ priorTeams: [], successorTeams: [] });
  });
});
