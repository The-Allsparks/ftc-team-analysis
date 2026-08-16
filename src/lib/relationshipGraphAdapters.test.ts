import { describe, expect, it } from 'vitest';
import type { SeasonId, Team, TeamSeason } from '../data/schema';
import {
  parseRelationshipGraph,
  roundTripRelationshipGraph,
  teamNodeId,
  teamSeasonNodeId,
} from '../data/relationshipGraph';
import {
  buildRelationshipGraph,
  buildRelationshipGraphFromSeed,
  projectTeamToGraph,
} from './relationshipGraphAdapters';
import { buildTeamLineageMap } from '../teamLineage';

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

function makeTeam(number: number, seasons: TeamSeason[], links: Team['links'] = []): Team {
  const seasonMap = Object.fromEntries(seasons.map((season) => [season.season, season])) as Team['seasons'];
  const latest = seasons[seasons.length - 1];
  return {
    number,
    latestName: latest?.name ?? `Team ${number}`,
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
    links,
    seasons: seasonMap,
  };
}

describe('relationshipGraphAdapters', () => {
  it('projects affiliations, events, awards, and links without mutating the team', () => {
    const team = makeTeam(
      9001,
      [
        makeSeason(2025, {
          name: 'Fixture Bots',
          organization: 'Helen C Cannon Middle School&REV Robotics',
          teamType: 'school',
          affiliations: [
            {
              entityType: 'school',
              name: 'Helen C Cannon Middle School',
              season: 2025,
              source: 'organization-backfill',
              retrievedAt: null,
              confidence: 'high',
              confirmationState: 'unconfirmed',
              sourceText: 'Helen C Cannon Middle School&REV Robotics',
            },
            {
              entityType: 'sponsor',
              name: 'REV Robotics',
              season: 2025,
              source: 'organization-backfill',
              retrievedAt: null,
              confidence: 'high',
              confirmationState: 'unconfirmed',
              sourceText: 'Helen C Cannon Middle School&REV Robotics',
            },
          ],
          events: [
            {
              code: 'USNVTEST',
              name: 'Test Meet',
              dateRange: 'January 1 to January 1, 2025',
              eventOrder: 1,
              location: 'Reno, NV, USA',
              league: null,
              rank: '1 of 10',
              totalPoints: 100,
              matchCount: 5,
              rankingScore: null,
              leagueSeasonRank: null,
              leagueSeasonRankTotal: null,
              qualificationUrl: null,
              playoffUrl: null,
              playoffRecord: null,
              allianceSelection: null,
              sourceUrl: 'https://ftc-events.firstinspires.org/2025/USNVTEST',
            },
          ],
          awards: [
            {
              name: 'Inspire Award',
              awardType: 'Inspire Award',
              eventName: 'Test Meet',
              eventCode: 'USNVTEST',
              awardUrl: 'https://ftc-events.firstinspires.org/2025/awards?id=1',
              eventUrl: 'https://ftc-events.firstinspires.org/2025/USNVTEST',
            },
          ],
          robot: 'Spark',
        }),
      ],
      [
        {
          type: 'website',
          label: 'Official Website',
          url: 'https://example.test/9001',
          source: 'FTC Events On The Web',
          ownershipConfidence: 'high',
          confirmationState: 'unconfirmed',
          evidence: 'On The Web URL',
          retrievedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    );

    const before = structuredClone(team);
    const { nodes, edges } = projectTeamToGraph(team);

    expect(team).toEqual(before);

    const nodeTypes = [...nodes.values()].map((n) => n.type);
    expect(nodeTypes).toEqual(
      expect.arrayContaining(['team', 'team_season', 'organization', 'event', 'award', 'artifact', 'robot']),
    );

    const edgeTypes = [...edges.values()].map((e) => e.type);
    expect(edgeTypes).toEqual(
      expect.arrayContaining([
        'has_season',
        'affiliated_with',
        'participates_in',
        'awarded',
        'award_at_event',
        'links_to',
      ]),
    );

    for (const edge of edges.values()) {
      expect(edge.evidence.source.length).toBeGreaterThan(0);
      expect(edge.evidence.confidence).toMatch(/^(high|medium|low)$/);
      expect(edge.evidence.confirmationState).toMatch(/^(unconfirmed|confirmed|rejected)$/);
    }

    const schoolEdge = [...edges.values()].find(
      (e) => e.type === 'affiliated_with' && e.props?.entityType === 'school',
    );
    expect(schoolEdge?.evidence.notes).toContain('Helen C Cannon Middle School');
    expect(nodes.has(teamSeasonNodeId(9001, 2025))).toBe(true);

    const schoolNode = [...nodes.values()].find(
      (n) => n.type === 'organization' && n.refs?.entityType === 'school',
    );
    expect(schoolNode?.refs?.ncesSch).toBe('320006000042');
    expect(schoolNode?.refs?.slug).toBe('helen-c-cannon-middle-school');

    const seasonNode = nodes.get(teamSeasonNodeId(9001, 2025));
    expect(seasonNode?.refs?.postalStateCode).toBe('NV');
    expect(seasonNode?.props?.registeredLocation).toMatchObject({
      stateCode: 'NV',
      subdivisionCode: 'US-NV',
    });
  });

  it('projects codeRepositories as repository nodes with ownership evidence', () => {
    const team: Team = {
      ...makeTeam(16158, [
        makeSeason(2025, {
          name: 'VC Silver Circuits',
          organization: 'Family/Community',
          teamType: 'non-school',
        }),
      ]),
      codeRepositories: [
        {
          url: 'https://github.com/example/16158-code',
          owner: 'example',
          name: '16158-code',
          fullName: 'example/16158-code',
          evidence: 'Declared On The Web code link',
          evidenceKind: 'declared-link',
          ownershipConfidence: 'high',
          confirmationState: 'unconfirmed',
          source: 'github-enrichment',
          retrievedAt: '2026-02-01T00:00:00.000Z',
        },
      ],
    };

    const graph = buildRelationshipGraph({ teams: [team], generatedAt: '2026-08-16T00:00:00.000Z' });
    const repoEdge = graph.edges.find((e) => e.type === 'has_repository');
    expect(repoEdge).toBeDefined();
    expect(repoEdge?.evidence.kind).toBe('declared-link');
    expect(repoEdge?.evidence.source).toBe('github-enrichment');
    expect(graph.nodes.some((n) => n.type === 'repository' && n.label === 'example/16158-code')).toBe(true);
  });

  it('projects videoResources as channel/video nodes with ownership evidence', () => {
    const team: Team = {
      ...makeTeam(16158, [
        makeSeason(2025, {
          name: 'Allsparks',
          organization: 'Family/Community',
          teamType: 'non-school',
        }),
      ]),
      videoResources: [
        {
          url: 'https://www.youtube.com/@AllsparksFTC',
          kind: 'channel',
          title: 'Allsparks FTC',
          evidence: 'Declared team website YouTube link',
          evidenceKind: 'declared-link',
          ownershipConfidence: 'high',
          confirmationState: 'unconfirmed',
          source: 'YouTube (verified)',
          retrievedAt: '2026-08-16T00:00:00.000Z',
        },
      ],
    };

    const graph = buildRelationshipGraph({ teams: [team], generatedAt: '2026-08-16T00:00:00.000Z' });
    expect(graph.nodes.some((n) => n.type === 'channel' && n.label === 'Allsparks FTC')).toBe(true);
    const edge = graph.edges.find(
      (e) => e.type === 'links_to' && e.evidence.source === 'YouTube (verified)',
    );
    expect(edge?.evidence.kind).toBe('declared-link');
  });

  it('maps lineage links into related_to edges and round-trips the full graph', () => {
    const prior = makeTeam(1001, [
      makeSeason(2022, {
        name: 'Cannon Bots',
        organization: 'Helen C Cannon Middle School',
        teamType: 'school',
      }),
    ]);
    const later = makeTeam(1002, [
      makeSeason(2024, {
        name: 'Cannon Robotics',
        organization: 'Helen C Cannon Middle School',
        teamType: 'school',
      }),
    ]);

    const lineageMap = buildTeamLineageMap([prior, later], []);
    const graph = buildRelationshipGraph({
      teams: [prior, later],
      lineageMap,
      generatedAt: '2026-08-16T12:00:00.000Z',
      label: 'fixture',
    });

    const related = graph.edges.filter((e) => e.type === 'related_to');
    expect(related.length).toBeGreaterThanOrEqual(1);
    expect(related.every((e) => e.evidence.source === 'team-lineage')).toBe(true);
    expect(related.every((e) => e.evidence.kind)).toBeTruthy();
    expect(graph.nodes.some((n) => n.id === teamNodeId(1001))).toBe(true);
    expect(graph.nodes.some((n) => n.id === teamNodeId(1002))).toBe(true);

    const roundTrip = roundTripRelationshipGraph(graph);
    expect(roundTrip.ok).toBe(true);
    if (roundTrip.ok) {
      expect(roundTrip.data.edges.filter((e) => e.type === 'related_to').length).toBe(related.length);
      expect(roundTrip.data.edges.every((e) => e.evidence?.source)).toBe(true);
    }
  });

  it('buildRelationshipGraphFromSeed preserves region events as event nodes', () => {
    const team = makeTeam(50, [
      makeSeason(2025, {
        name: 'Solo',
        organization: 'Solo High School',
        teamType: 'school',
      }),
    ]);
    const graph = buildRelationshipGraphFromSeed({
      teams: [team],
      regionEvents: [
        {
          season: 2025,
          code: 'USNVREG',
          name: 'Region Championship',
          league: null,
          location: 'Las Vegas, NV',
          date: '2025-03-01',
          sourceUrl: 'https://ftc-events.firstinspires.org/2025/USNVREG',
        },
      ],
      generatedAt: '2026-08-16T00:00:00.000Z',
      regionCode: 'USNV',
    });

    expect(graph.label).toBe('USNV');
    expect(graph.nodes.some((n) => n.id === 'event:2025:USNVREG')).toBe(true);
    const parsed = parseRelationshipGraph(JSON.parse(JSON.stringify(graph)));
    expect(parsed.ok).toBe(true);
  });
});
