import { describe, expect, it } from 'vitest';
import { SeasonId, Team, TeamSeason } from './data/schema';
import {
  buildTeamLineageMap,
  formatRelationshipTypeLabel,
  getTeamLineage,
  TeamRelationshipOverride,
  visibleRelatedLinks,
} from './teamLineage';

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
  it('links school teams that share a school as unconfirmed related edges, not confirmed succession', () => {
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

    const lineage = buildTeamLineageMap([prior, successor], []);
    const laterView = getTeamLineage(lineage, 1002).priorTeams[0];
    const earlierView = getTeamLineage(lineage, 1001).successorTeams[0];

    expect(laterView).toEqual(
      expect.objectContaining({
        teamNumber: 1001,
        confirmationState: 'unconfirmed',
        confidence: expect.stringMatching(/^(high|medium)$/),
      }),
    );
    expect(laterView.relationshipType).toMatch(/^(same_school|possible_renumbering|possible_related)$/);
    expect(laterView.relationshipType).not.toMatch(/^confirmed_/);
    expect(laterView.confidenceExplanation).toMatch(/unconfirmed/i);
    expect(laterView.evidence.some((row) => row.kind === 'shared_school')).toBe(true);
    expect(earlierView.teamNumber).toBe(1002);
  });

  it('emits possible_renumbering only for tight sequential pairs with shared name tokens', () => {
    const prior = makeTeam(1101, [
      makeSeason(2022, {
        name: 'Desert Sparks',
        organization: 'Desert Pines High School',
        teamType: 'school',
      }),
    ]);
    const next = makeTeam(1102, [
      makeSeason(2023, {
        name: 'Desert Sparks FTC',
        organization: 'Desert Pines High School',
        teamType: 'school',
      }),
    ]);

    const link = getTeamLineage(buildTeamLineageMap([prior, next], []), 1102).priorTeams[0];
    expect(link.relationshipType).toBe('possible_renumbering');
    expect(link.matchReason).toMatch(/Possible renumbering/);
    expect(link.confirmationState).toBe('unconfirmed');
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

    const lineage = buildTeamLineageMap([prior, successor], []);

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

    const lineage = buildTeamLineageMap([prior, successor], []);

    expect(getTeamLineage(lineage, 3001).successorTeams).toEqual([]);
    expect(getTeamLineage(lineage, 3002).priorTeams).toEqual([]);
  });

  it('emits sister_team for overlapping same-school seasons instead of inventing succession', () => {
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

    const lineage = buildTeamLineageMap([teamA, teamB], []);
    const link = visibleRelatedLinks(getTeamLineage(lineage, 4001)).find((row) => row.teamNumber === 4002);

    expect(link).toEqual(
      expect.objectContaining({
        relationshipType: 'sister_team',
        confirmationState: 'unconfirmed',
      }),
    );
    expect(link?.matchReason).toMatch(/Sister team/);
    expect(link?.confidenceExplanation).toMatch(/not succession/i);
  });

  it('does not auto-claim renumbering when a school has concurrent multi-number history', () => {
    const teamA = makeTeam(6001, [
      makeSeason(2022, {
        name: 'West Alpha',
        organization: 'Palo Verde High School',
        teamType: 'school',
      }),
      makeSeason(2023, {
        name: 'West Alpha',
        organization: 'Palo Verde High School',
        teamType: 'school',
      }),
    ]);
    const teamB = makeTeam(6002, [
      makeSeason(2023, {
        name: 'West Beta',
        organization: 'Palo Verde High School',
        teamType: 'school',
      }),
    ]);
    const teamC = makeTeam(6003, [
      makeSeason(2025, {
        name: 'West Gamma',
        organization: 'Palo Verde High School',
        teamType: 'school',
      }),
    ]);

    const lineage = buildTeamLineageMap([teamA, teamB, teamC], []);
    const related = visibleRelatedLinks(getTeamLineage(lineage, 6003));

    expect(related.length).toBeGreaterThan(0);
    expect(related.every((link) => link.relationshipType !== 'possible_renumbering')).toBe(true);
    expect(related.every((link) => !link.relationshipType.startsWith('confirmed_'))).toBe(true);
    expect(related.every((link) => link.confirmationState === 'unconfirmed')).toBe(true);
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

    const lineage = buildTeamLineageMap([prior, successor], []);

    expect(getTeamLineage(lineage, 5001).successorTeams).toEqual([]);
    expect(getTeamLineage(lineage, 5002).priorTeams).toEqual([]);
  });

  it('applies curator confirm overrides and hides rejected edges from default UI', () => {
    const prior = makeTeam(7001, [
      makeSeason(2021, {
        name: 'Legacy Bots',
        organization: 'Basic Academy High School',
        teamType: 'school',
      }),
    ]);
    const next = makeTeam(7002, [
      makeSeason(2023, {
        name: 'Legacy Bots',
        organization: 'Basic Academy High School',
        teamType: 'school',
      }),
    ]);
    const rejectedOther = makeTeam(7003, [
      makeSeason(2025, {
        name: 'Unrelated Name',
        organization: 'Basic Academy High School',
        teamType: 'school',
      }),
    ]);

    const overrides: TeamRelationshipOverride[] = [
      {
        teamNumberA: 7001,
        teamNumberB: 7002,
        relationshipType: 'confirmed_successor',
        confirmationState: 'confirmed',
        note: 'Program continued under new number',
      },
      {
        teamNumberA: 7001,
        teamNumberB: 7003,
        relationshipType: 'same_school',
        confirmationState: 'rejected',
      },
    ];

    const lineage = buildTeamLineageMap([prior, next, rejectedOther], overrides);
    const from7001 = visibleRelatedLinks(getTeamLineage(lineage, 7001));
    const to7002 = getTeamLineage(lineage, 7002).priorTeams[0];

    expect(from7001.some((link) => link.teamNumber === 7003)).toBe(false);
    expect(getTeamLineage(lineage, 7001).successorTeams.some((link) => link.teamNumber === 7003)).toBe(false);
    expect(to7002).toEqual(
      expect.objectContaining({
        teamNumber: 7001,
        relationshipType: 'confirmed_predecessor',
        confirmationState: 'confirmed',
        confidence: 'high',
      }),
    );
    expect(from7001.find((link) => link.teamNumber === 7002)?.relationshipType).toBe('confirmed_successor');
  });
});

describe('relationship labeling', () => {
  it('snapshots human-readable relationship type labels', () => {
    expect(formatRelationshipTypeLabel('same_school')).toBe('Same school');
    expect(formatRelationshipTypeLabel('sister_team')).toBe('Sister team');
    expect(formatRelationshipTypeLabel('possible_renumbering')).toBe('Possible renumbering');
    expect(formatRelationshipTypeLabel('confirmed_predecessor')).toBe('Confirmed predecessor');
    expect(formatRelationshipTypeLabel('confirmed_successor')).toBe('Confirmed successor');
  });

  it('snapshots matchReason strings for heuristic relationship types', () => {
    const prior = makeTeam(8001, [
      makeSeason(2022, {
        name: 'Canyon Cats',
        organization: 'Canyon Springs High School',
        teamType: 'school',
      }),
    ]);
    const sister = makeTeam(8002, [
      makeSeason(2022, {
        name: 'Canyon Dogs',
        organization: 'Canyon Springs High School',
        teamType: 'school',
      }),
    ]);
    const later = makeTeam(8003, [
      makeSeason(2024, {
        name: 'Canyon Cats',
        organization: 'Canyon Springs High School',
        teamType: 'school',
      }),
    ]);

    const lineage = buildTeamLineageMap([prior, sister, later], []);
    const sisterLink = visibleRelatedLinks(getTeamLineage(lineage, 8001)).find((row) => row.teamNumber === 8002);
    const laterLink = getTeamLineage(lineage, 8001).successorTeams.find((row) => row.teamNumber === 8003);

    expect(sisterLink?.matchReason).toMatchInlineSnapshot(
      `"Sister team at same school (canyon springs HS); overlapping seasons"`,
    );
    expect(laterLink?.matchReason).toMatch(/same school|Possible renumbering|Possible related/i);
    expect(laterLink?.relationshipType).not.toMatch(/^confirmed_/);
  });
});

describe('getTeamLineage', () => {
  it('returns empty prior and successor lists for an unknown team number', () => {
    const lineage = buildTeamLineageMap([], []);
    expect(getTeamLineage(lineage, 99999)).toEqual({ priorTeams: [], successorTeams: [] });
  });
});
