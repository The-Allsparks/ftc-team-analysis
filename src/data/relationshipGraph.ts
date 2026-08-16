/**
 * Evidence-backed team relationship graph model (#28).
 *
 * The graph is a **derived view** over the document-oriented seed (`GeneratedData`),
 * lineage map, affiliations, links, and repositories. It is not a graph database
 * and does not replace the mega seed. See docs/relationship-graph.md.
 */
import * as v from 'valibot';

export const RELATIONSHIP_GRAPH_SCHEMA_VERSION = 1 as const;

/** Core + placeholder node kinds for future media/CAD without forcing storage yet. */
export const GRAPH_NODE_TYPES = [
  'team',
  'team_season',
  'organization',
  'event',
  'award',
  'artifact',
  'repository',
  'video',
  'channel',
  'robot',
] as const;

export type GraphNodeType = (typeof GRAPH_NODE_TYPES)[number];

export const GRAPH_EDGE_TYPES = [
  /** Team → TeamSeason */
  'has_season',
  /** TeamSeason → Organization (affiliation) */
  'affiliated_with',
  /** TeamSeason → Event */
  'participates_in',
  /** TeamSeason → Award */
  'awarded',
  /** Award → Event (when event is known) */
  'award_at_event',
  /** Team → Artifact (TeamLink / website / social / etc.) */
  'links_to',
  /** Team → Repository */
  'has_repository',
  /** Team ↔ Team (lineage / related) */
  'related_to',
  /** Reserved when match-level data exists */
  'alliance_with',
  'opponent_of',
] as const;

export type GraphEdgeType = (typeof GRAPH_EDGE_TYPES)[number];

export type GraphConfidence = 'high' | 'medium' | 'low';
export type GraphConfirmation = 'unconfirmed' | 'confirmed' | 'rejected';

/**
 * Required evidence on every edge. Mirrors affiliation / field-evidence /
 * lineage provenance so projections stay auditable.
 */
export type GraphEdgeEvidence = {
  /** Short source label (e.g. organization-backfill, team-lineage, FTC Events On The Web). */
  source: string;
  /** ISO timestamp when known; null for offline / derived projections. */
  retrievedAt: string | null;
  confidence: GraphConfidence;
  confirmationState: GraphConfirmation;
  /** Human-readable note or evidence summary. */
  notes?: string | null;
  /** Primary URL supporting the edge when known. */
  url?: string | null;
  /** Optional typed evidence kind (e.g. shared_school, declared-link). */
  kind?: string | null;
  /** Extra detail preserved from lineage / link evidence rows. */
  detail?: string | null;
  /** Optional validity window (ISO date or season string). */
  validFrom?: string | null;
  validTo?: string | null;
};

export type GraphNode = {
  id: string;
  type: GraphNodeType;
  label: string;
  /** Stable external refs (teamNumber, season, url, entityType, …). */
  refs?: Record<string, string | number | boolean | null>;
  /** Non-identity payload preserved for lossless projection. */
  props?: Record<string, unknown>;
};

export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  type: GraphEdgeType;
  /** Required — Valibot rejects edges without a complete evidence object. */
  evidence: GraphEdgeEvidence;
  props?: Record<string, unknown>;
};

export type RelationshipGraph = {
  schemaVersion: typeof RELATIONSHIP_GRAPH_SCHEMA_VERSION;
  generatedAt: string;
  /** Optional region / build label for derived snapshots. */
  label?: string | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

const nullableString = v.nullable(v.string());
const confidenceSchema = v.picklist(['high', 'medium', 'low']);
const confirmationSchema = v.picklist(['unconfirmed', 'confirmed', 'rejected']);

export const graphEdgeEvidenceSchema = v.object({
  source: v.pipe(v.string(), v.minLength(1)),
  retrievedAt: nullableString,
  confidence: confidenceSchema,
  confirmationState: confirmationSchema,
  notes: v.optional(nullableString),
  url: v.optional(nullableString),
  kind: v.optional(nullableString),
  detail: v.optional(nullableString),
  validFrom: v.optional(nullableString),
  validTo: v.optional(nullableString),
});

const graphNodeTypeSchema = v.picklist([...GRAPH_NODE_TYPES]);
const graphEdgeTypeSchema = v.picklist([...GRAPH_EDGE_TYPES]);

const refValueSchema = v.union([v.string(), v.number(), v.boolean(), v.null()]);

export const graphNodeSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  type: graphNodeTypeSchema,
  label: v.string(),
  refs: v.optional(v.record(v.string(), refValueSchema)),
  props: v.optional(v.record(v.string(), v.unknown())),
});

export const graphEdgeSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  from: v.pipe(v.string(), v.minLength(1)),
  to: v.pipe(v.string(), v.minLength(1)),
  type: graphEdgeTypeSchema,
  evidence: graphEdgeEvidenceSchema,
  props: v.optional(v.record(v.string(), v.unknown())),
});

export const relationshipGraphSchema = v.object({
  schemaVersion: v.literal(RELATIONSHIP_GRAPH_SCHEMA_VERSION),
  generatedAt: v.string(),
  label: v.optional(nullableString),
  nodes: v.array(graphNodeSchema),
  edges: v.array(graphEdgeSchema),
});

export type ParseRelationshipGraphResult =
  | { ok: true; data: RelationshipGraph }
  | { ok: false; issues: Array<{ path: string; message: string }> };

function issuePath(issue: v.BaseIssue<unknown>): string {
  const suffix = (issue.path ?? [])
    .map((item) => (typeof item.key === 'number' ? `[${item.key}]` : `.${String(item.key)}`))
    .join('');
  return suffix.replace(/^\./, '') || '(root)';
}

/** Parse / validate a relationship graph document (round-trip entry point). */
export function parseRelationshipGraph(input: unknown): ParseRelationshipGraphResult {
  const result = v.safeParse(relationshipGraphSchema, input);
  if (result.success) {
    return { ok: true, data: result.output as RelationshipGraph };
  }
  return {
    ok: false,
    issues: result.issues.map((issue) => ({
      path: issuePath(issue),
      message: issue.message,
    })),
  };
}

/** Serialize then re-parse; fails if the graph is not schema-valid. */
export function serializeRelationshipGraph(graph: RelationshipGraph): string {
  return JSON.stringify(graph);
}

export function roundTripRelationshipGraph(graph: RelationshipGraph): ParseRelationshipGraphResult {
  return parseRelationshipGraph(JSON.parse(serializeRelationshipGraph(graph)));
}

/** Stable node id helpers — adapters and tests share these. */
export function teamNodeId(teamNumber: number): string {
  return `team:${teamNumber}`;
}

export function teamSeasonNodeId(teamNumber: number, season: number): string {
  return `team_season:${teamNumber}:${season}`;
}

export function organizationNodeId(entityType: string, name: string): string {
  return `organization:${entityType}:${slugify(name)}`;
}

export function eventNodeId(season: number, code: string | null, name: string): string {
  if (code && code.trim()) {
    return `event:${season}:${code.trim()}`;
  }
  return `event:${season}:name:${slugify(name)}`;
}

export function awardNodeId(
  teamNumber: number,
  season: number,
  awardName: string,
  eventCode: string | null,
): string {
  return `award:${teamNumber}:${season}:${slugify(awardName)}:${eventCode?.trim() || 'none'}`;
}

export function artifactNodeId(url: string): string {
  return `artifact:${slugifyUrl(url)}`;
}

export function repositoryNodeId(fullName: string): string {
  return `repository:${fullName.trim().toLowerCase()}`;
}

export function relatedEdgeId(fromTeam: number, toTeam: number, relationshipType: string): string {
  const [a, b] = fromTeam <= toTeam ? [fromTeam, toTeam] : [toTeam, fromTeam];
  return `related_to:${a}:${b}:${relationshipType}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'unnamed';
}

function slugifyUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return slugify(`${parsed.host}${parsed.pathname}${parsed.search}`);
  } catch {
    return slugify(url);
  }
}
