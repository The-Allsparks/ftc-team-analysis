/**
 * Pure adapters that project seed / lineage structures into the relationship graph
 * without mutating the source documents (#28).
 */
import type {
  GeneratedData,
  Team,
  TeamAffiliation,
  TeamAward,
  TeamCodeRepository,
  TeamEvent,
  TeamLink,
  TeamSeason,
  TeamVideoResource,
} from '../data/schema';
import {
  GraphEdge,
  GraphEdgeEvidence,
  GraphNode,
  RelationshipGraph,
  RELATIONSHIP_GRAPH_SCHEMA_VERSION,
  artifactNodeId,
  awardNodeId,
  eventNodeId,
  organizationNodeId,
  relatedEdgeId,
  repositoryNodeId,
  teamNodeId,
  teamSeasonNodeId,
} from '../data/relationshipGraph';
import { affiliationsForSeason } from './organizationAffiliations';
import { enrichAffiliationIdentity, buildRegisteredLocation } from './canonicalIdentity';
import type { TeamLineage, TeamLineageLink } from '../teamLineage';

export type TeamLineageMap = Map<number, TeamLineage>;

function evidence(partial: GraphEdgeEvidence): GraphEdgeEvidence {
  return {
    source: partial.source,
    retrievedAt: partial.retrievedAt ?? null,
    confidence: partial.confidence,
    confirmationState: partial.confirmationState,
    notes: partial.notes ?? null,
    url: partial.url ?? null,
    kind: partial.kind ?? null,
    detail: partial.detail ?? null,
    validFrom: partial.validFrom ?? null,
    validTo: partial.validTo ?? null,
  };
}

function upsertNode(nodes: Map<string, GraphNode>, node: GraphNode): void {
  const prior = nodes.get(node.id);
  if (!prior) {
    nodes.set(node.id, node);
    return;
  }
  nodes.set(node.id, {
    ...prior,
    ...node,
    refs: { ...prior.refs, ...node.refs },
    props: { ...prior.props, ...node.props },
  });
}

function pushEdge(edges: Map<string, GraphEdge>, edge: GraphEdge): void {
  if (!edges.has(edge.id)) {
    edges.set(edge.id, edge);
  }
}

function projectAffiliation(
  teamNumber: number,
  season: TeamSeason,
  affiliation: TeamAffiliation,
  nodes: Map<string, GraphNode>,
  edges: Map<string, GraphEdge>,
): void {
  const enriched = enrichAffiliationIdentity(affiliation, {
    stateCode: season.registeredLocation?.stateCode ?? season.state,
  });
  const orgId = organizationNodeId(enriched.entityType, enriched.normalizedName ?? enriched.name);
  const ncesSch = enriched.identifiers?.find((row) => row.idNamespace === 'nces-sch')?.canonicalId;
  const ncesPss = enriched.identifiers?.find((row) => row.idNamespace === 'nces-pss')?.canonicalId;
  const ncesLea = enriched.identifiers?.find((row) => row.idNamespace === 'nces-lea')?.canonicalId;

  upsertNode(nodes, {
    id: orgId,
    type: 'organization',
    label: enriched.name,
    refs: {
      entityType: enriched.entityType,
      name: enriched.name,
      ...(enriched.normalizedName ? { normalizedName: enriched.normalizedName } : {}),
      ...(enriched.slug ? { slug: enriched.slug } : {}),
      ...(enriched.identityMatchStatus ? { identityMatchStatus: enriched.identityMatchStatus } : {}),
      ...(ncesSch ? { ncesSch } : {}),
      ...(ncesPss ? { ncesPss } : {}),
      ...(ncesLea ? { ncesLea } : {}),
    },
    props: {
      sourceText: enriched.sourceText,
      ...(enriched.identifiers ? { identifiers: enriched.identifiers } : {}),
      ...(enriched.aliases ? { aliases: enriched.aliases } : {}),
    },
  });

  const seasonId = teamSeasonNodeId(teamNumber, season.season);
  pushEdge(edges, {
    id: `affiliated_with:${seasonId}:${orgId}`,
    from: seasonId,
    to: orgId,
    type: 'affiliated_with',
    evidence: evidence({
      source: enriched.source,
      retrievedAt: enriched.retrievedAt,
      confidence: enriched.confidence,
      confirmationState: enriched.confirmationState,
      notes: enriched.sourceText,
      url: season.sourceUrl,
      kind: enriched.entityType,
      detail: `season ${enriched.season}`,
      validFrom: String(enriched.season),
      validTo: String(enriched.season),
    }),
    props: {
      entityType: enriched.entityType,
      season: enriched.season,
      ...(enriched.identityMatchStatus ? { identityMatchStatus: enriched.identityMatchStatus } : {}),
    },
  });
}

function projectEvent(
  teamNumber: number,
  season: TeamSeason,
  event: TeamEvent,
  nodes: Map<string, GraphNode>,
  edges: Map<string, GraphEdge>,
): void {
  const eventId = eventNodeId(season.season, event.code, event.name);
  upsertNode(nodes, {
    id: eventId,
    type: 'event',
    label: event.name,
    refs: {
      season: season.season,
      code: event.code,
      name: event.name,
    },
    props: {
      dateRange: event.dateRange,
      location: event.location,
      league: event.league,
      sourceUrl: event.sourceUrl,
      rank: event.rank,
      matchCount: event.matchCount,
      totalPoints: event.totalPoints,
      rankingScore: event.rankingScore,
      qualificationUrl: event.qualificationUrl,
      playoffUrl: event.playoffUrl,
      playoffRecord: event.playoffRecord,
      allianceSelection: event.allianceSelection,
      eventOrder: event.eventOrder,
    },
  });

  const seasonId = teamSeasonNodeId(teamNumber, season.season);
  pushEdge(edges, {
    id: `participates_in:${seasonId}:${eventId}`,
    from: seasonId,
    to: eventId,
    type: 'participates_in',
    evidence: evidence({
      source: 'ftc-events-team-page',
      retrievedAt: null,
      confidence: 'high',
      confirmationState: 'unconfirmed',
      notes: event.rank ? `rank ${event.rank}` : event.name,
      url: event.sourceUrl ?? season.sourceUrl,
      kind: 'season-event',
      detail: event.dateRange,
      validFrom: String(season.season),
      validTo: String(season.season),
    }),
    props: {
      rank: event.rank,
      matchCount: event.matchCount,
    },
  });
}

function projectAward(
  teamNumber: number,
  season: TeamSeason,
  award: TeamAward,
  nodes: Map<string, GraphNode>,
  edges: Map<string, GraphEdge>,
): void {
  const awardId = awardNodeId(teamNumber, season.season, award.name, award.eventCode);
  upsertNode(nodes, {
    id: awardId,
    type: 'award',
    label: award.name,
    refs: {
      teamNumber,
      season: season.season,
      awardType: award.awardType,
      eventCode: award.eventCode,
      eventName: award.eventName,
    },
    props: {
      awardUrl: award.awardUrl,
      eventUrl: award.eventUrl,
    },
  });

  const seasonId = teamSeasonNodeId(teamNumber, season.season);
  pushEdge(edges, {
    id: `awarded:${seasonId}:${awardId}`,
    from: seasonId,
    to: awardId,
    type: 'awarded',
    evidence: evidence({
      source: 'ftc-events-team-page',
      retrievedAt: null,
      confidence: 'high',
      confirmationState: 'unconfirmed',
      notes: `${award.awardType} @ ${award.eventName}`,
      url: award.awardUrl ?? award.eventUrl ?? season.sourceUrl,
      kind: award.awardType,
      detail: award.eventName,
      validFrom: String(season.season),
      validTo: String(season.season),
    }),
  });

  if (award.eventCode || award.eventName) {
    const eventId = eventNodeId(season.season, award.eventCode, award.eventName);
    upsertNode(nodes, {
      id: eventId,
      type: 'event',
      label: award.eventName,
      refs: {
        season: season.season,
        code: award.eventCode,
        name: award.eventName,
      },
      props: {
        sourceUrl: award.eventUrl,
      },
    });
    pushEdge(edges, {
      id: `award_at_event:${awardId}:${eventId}`,
      from: awardId,
      to: eventId,
      type: 'award_at_event',
      evidence: evidence({
        source: 'ftc-events-team-page',
        retrievedAt: null,
        confidence: 'high',
        confirmationState: 'unconfirmed',
        notes: award.eventName,
        url: award.eventUrl ?? season.sourceUrl,
        kind: 'award-event',
        validFrom: String(season.season),
        validTo: String(season.season),
      }),
    });
  }
}

function projectLink(
  team: Team,
  link: TeamLink,
  nodes: Map<string, GraphNode>,
  edges: Map<string, GraphEdge>,
): void {
  const id = artifactNodeId(link.url);
  upsertNode(nodes, {
    id,
    type: 'artifact',
    label: link.label,
    refs: {
      url: link.url,
      linkType: link.type,
    },
    props: {
      liveness: link.liveness ?? null,
      httpStatus: link.httpStatus ?? null,
      lastCheckedAt: link.lastCheckedAt ?? null,
    },
  });

  pushEdge(edges, {
    id: `links_to:${teamNodeId(team.number)}:${id}`,
    from: teamNodeId(team.number),
    to: id,
    type: 'links_to',
    evidence: evidence({
      source: link.source,
      retrievedAt: link.retrievedAt ?? null,
      confidence: link.ownershipConfidence ?? 'medium',
      confirmationState: link.confirmationState ?? 'unconfirmed',
      notes: link.evidence ?? link.notes ?? link.label,
      url: link.url,
      kind: link.type,
      detail: link.notes ?? null,
    }),
    props: {
      linkType: link.type,
    },
  });
}

function projectRepository(
  team: Team,
  repo: TeamCodeRepository,
  nodes: Map<string, GraphNode>,
  edges: Map<string, GraphEdge>,
): void {
  const id = repositoryNodeId(repo.fullName);
  upsertNode(nodes, {
    id,
    type: 'repository',
    label: repo.fullName,
    refs: {
      url: repo.url,
      owner: repo.owner,
      name: repo.name,
      fullName: repo.fullName,
    },
    props: {
      seasons: repo.seasons ?? null,
      robotControllerType: repo.robotControllerType ?? null,
      languages: repo.languages ?? null,
      lastActivity: repo.lastActivity ?? null,
      description: repo.description ?? null,
      evidenceKind: repo.evidenceKind,
    },
  });

  pushEdge(edges, {
    id: `has_repository:${teamNodeId(team.number)}:${id}`,
    from: teamNodeId(team.number),
    to: id,
    type: 'has_repository',
    evidence: evidence({
      source: repo.source,
      retrievedAt: repo.retrievedAt ?? null,
      confidence: repo.ownershipConfidence,
      confirmationState: repo.confirmationState ?? 'unconfirmed',
      notes: repo.evidence,
      url: repo.url,
      kind: repo.evidenceKind,
      detail: repo.description ?? null,
    }),
  });
}

function projectVideoResource(
  team: Team,
  resource: TeamVideoResource,
  nodes: Map<string, GraphNode>,
  edges: Map<string, GraphEdge>,
): void {
  const id = artifactNodeId(resource.url);
  const nodeType = resource.kind === 'channel' ? 'channel' : 'video';
  upsertNode(nodes, {
    id,
    type: nodeType,
    label: resource.title || resource.url,
    refs: {
      url: resource.url,
      channelId: resource.channelId ?? null,
      videoId: resource.videoId ?? null,
      playlistId: resource.playlistId ?? null,
      kind: resource.kind,
    },
    props: {
      publishedAt: resource.publishedAt ?? null,
      seasonHint: resource.seasonHint ?? null,
      evidenceKind: resource.evidenceKind,
    },
  });

  pushEdge(edges, {
    id: `links_to:${teamNodeId(team.number)}:${id}`,
    from: teamNodeId(team.number),
    to: id,
    type: 'links_to',
    evidence: evidence({
      source: resource.source,
      retrievedAt: resource.retrievedAt ?? null,
      confidence: resource.ownershipConfidence,
      confirmationState: resource.confirmationState ?? 'unconfirmed',
      notes: resource.evidence,
      url: resource.url,
      kind: resource.evidenceKind,
      detail: resource.title ?? null,
    }),
    props: {
      linkType: resource.kind,
    },
  });
}

function projectSeason(
  teamNumber: number,
  season: TeamSeason,
  nodes: Map<string, GraphNode>,
  edges: Map<string, GraphEdge>,
): void {
  const seasonId = teamSeasonNodeId(teamNumber, season.season);
  const registeredLocation = buildRegisteredLocation(season);
  upsertNode(nodes, {
    id: seasonId,
    type: 'team_season',
    label: `${teamNumber} · ${season.season} · ${season.name}`,
    refs: {
      teamNumber,
      season: season.season,
      name: season.name,
      active: season.active,
      ...(registeredLocation.stateCode ? { postalStateCode: registeredLocation.stateCode } : {}),
      ...(registeredLocation.subdivisionCode
        ? { subdivisionCode: registeredLocation.subdivisionCode }
        : {}),
      ...(season.region ? { eventRegion: season.region } : {}),
    },
    props: {
      location: season.location,
      registeredLocation,
      organization: season.organization,
      website: season.website,
      robot: season.robot,
      sourceUrl: season.sourceUrl,
      teamType: season.teamType,
      league: season.league,
      region: season.region,
      record: season.record,
      qualificationRecord: season.qualificationRecord,
      playoffRecord: season.playoffRecord,
      notes: season.notes,
    },
  });

  pushEdge(edges, {
    id: `has_season:${teamNodeId(teamNumber)}:${seasonId}`,
    from: teamNodeId(teamNumber),
    to: seasonId,
    type: 'has_season',
    evidence: evidence({
      source: 'ftc-events-team-page',
      retrievedAt: null,
      confidence: 'high',
      confirmationState: 'unconfirmed',
      notes: season.name,
      url: season.sourceUrl,
      kind: 'team-season',
      validFrom: String(season.season),
      validTo: String(season.season),
    }),
  });

  for (const affiliation of affiliationsForSeason(season)) {
    projectAffiliation(teamNumber, season, affiliation, nodes, edges);
  }
  for (const event of season.events) {
    projectEvent(teamNumber, season, event, nodes, edges);
  }
  for (const award of season.awards) {
    projectAward(teamNumber, season, award, nodes, edges);
  }

  if (season.robot && season.robot.trim()) {
    const robotId = `robot:${teamNumber}:${season.season}:${season.robot.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    upsertNode(nodes, {
      id: robotId,
      type: 'robot',
      label: season.robot,
      refs: { teamNumber, season: season.season, name: season.robot },
    });
    pushEdge(edges, {
      id: `links_to:${seasonId}:${robotId}`,
      from: seasonId,
      to: robotId,
      type: 'links_to',
      evidence: evidence({
        source: 'ftc-events-team-page',
        retrievedAt: null,
        confidence: 'medium',
        confirmationState: 'unconfirmed',
        notes: 'Season robot name from public team page',
        url: season.sourceUrl,
        kind: 'robot',
        validFrom: String(season.season),
        validTo: String(season.season),
      }),
    });
  }
}

/**
 * Project a single team (and its seasons / links / repos) into nodes + edges.
 * Does not mutate `team`.
 */
export function projectTeamToGraph(
  team: Team,
  nodes: Map<string, GraphNode> = new Map(),
  edges: Map<string, GraphEdge> = new Map(),
): { nodes: Map<string, GraphNode>; edges: Map<string, GraphEdge> } {
  upsertNode(nodes, {
    id: teamNodeId(team.number),
    type: 'team',
    label: `${team.number} ${team.latestName}`,
    refs: {
      teamNumber: team.number,
      latestName: team.latestName,
    },
    props: {
      latestLocation: team.latestLocation,
      latestOrganization: team.latestOrganization,
      latestWebsite: team.latestWebsite,
      latestTeamType: team.latestTeamType,
      latestRookieYear: team.latestRookieYear,
    },
  });

  for (const season of Object.values(team.seasons)) {
    if (season) {
      projectSeason(team.number, season, nodes, edges);
    }
  }

  for (const link of team.links) {
    projectLink(team, link, nodes, edges);
  }

  for (const repo of team.codeRepositories ?? []) {
    projectRepository(team, repo, nodes, edges);
  }

  for (const resource of team.videoResources ?? []) {
    projectVideoResource(team, resource, nodes, edges);
  }

  return { nodes, edges };
}

/**
 * Project lineage / related-team links into `related_to` edges.
 * Emits one undirected-style edge id per pair+type (sorted team numbers).
 */
export function projectLineageLinkToGraph(
  fromTeamNumber: number,
  link: TeamLineageLink,
  nodes: Map<string, GraphNode>,
  edges: Map<string, GraphEdge>,
): void {
  const toId = teamNodeId(link.teamNumber);
  upsertNode(nodes, {
    id: toId,
    type: 'team',
    label: `${link.teamNumber} ${link.teamName}`,
    refs: {
      teamNumber: link.teamNumber,
      latestName: link.teamName,
    },
  });

  const edgeId = relatedEdgeId(fromTeamNumber, link.teamNumber, link.relationshipType);
  const primaryEvidence = link.evidence[0];
  pushEdge(edges, {
    id: edgeId,
    from: teamNodeId(fromTeamNumber),
    to: toId,
    type: 'related_to',
    evidence: evidence({
      source: 'team-lineage',
      retrievedAt: null,
      confidence: link.confidence,
      confirmationState: link.confirmationState,
      notes: link.confidenceExplanation,
      url: primaryEvidence?.sourceUrl ?? null,
      kind: link.relationshipType,
      detail: link.evidence.map((row) => `${row.kind}: ${row.detail}`).join(' | ') || link.matchReason,
      validFrom: link.seasonRange.includes('–') ? link.seasonRange.split('–')[0]?.trim() : null,
      validTo: link.seasonRange.includes('–') ? link.seasonRange.split('–')[1]?.trim() : null,
    }),
    props: {
      relationshipType: link.relationshipType,
      matchReason: link.matchReason,
      seasonRange: link.seasonRange,
      evidenceRows: link.evidence,
      orientedFrom: fromTeamNumber,
      orientedTo: link.teamNumber,
    },
  });
}

export function projectLineageMapToGraph(
  lineageMap: TeamLineageMap,
  nodes: Map<string, GraphNode> = new Map(),
  edges: Map<string, GraphEdge> = new Map(),
): { nodes: Map<string, GraphNode>; edges: Map<string, GraphEdge> } {
  for (const [fromTeamNumber, lineage] of lineageMap.entries()) {
    if (!lineage) {
      continue;
    }
    for (const link of [...lineage.priorTeams, ...lineage.successorTeams]) {
      projectLineageLinkToGraph(fromTeamNumber, link, nodes, edges);
    }
  }
  return { nodes, edges };
}

export type BuildRelationshipGraphInput = {
  teams: Team[];
  /** Optional precomputed lineage map (from buildTeamLineageMap). */
  lineageMap?: TeamLineageMap;
  regionEvents?: GeneratedData['regionEvents'];
  generatedAt?: string;
  label?: string | null;
};

/**
 * Build a complete relationship graph document from teams (+ optional lineage).
 * Pure: does not mutate inputs or write disk.
 */
export function buildRelationshipGraph(input: BuildRelationshipGraphInput): RelationshipGraph {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();

  for (const team of input.teams) {
    projectTeamToGraph(team, nodes, edges);
  }

  if (input.lineageMap) {
    projectLineageMapToGraph(input.lineageMap, nodes, edges);
  }

  for (const regionEvent of input.regionEvents ?? []) {
    const id = eventNodeId(regionEvent.season, regionEvent.code, regionEvent.name);
    upsertNode(nodes, {
      id,
      type: 'event',
      label: regionEvent.name,
      refs: {
        season: regionEvent.season,
        code: regionEvent.code,
        name: regionEvent.name,
      },
      props: {
        league: regionEvent.league,
        location: regionEvent.location,
        date: regionEvent.date,
        sourceUrl: regionEvent.sourceUrl,
        regionCatalog: true,
      },
    });
  }

  return {
    schemaVersion: RELATIONSHIP_GRAPH_SCHEMA_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    label: input.label ?? null,
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...edges.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

/** Convenience: build graph from a GeneratedData seed envelope. */
export function buildRelationshipGraphFromSeed(
  data: Pick<GeneratedData, 'teams' | 'regionEvents' | 'generatedAt' | 'regionCode'>,
  lineageMap?: TeamLineageMap,
): RelationshipGraph {
  return buildRelationshipGraph({
    teams: data.teams,
    regionEvents: data.regionEvents,
    lineageMap,
    generatedAt: data.generatedAt,
    label: data.regionCode,
  });
}
