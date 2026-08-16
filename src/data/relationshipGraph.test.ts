import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import {
  GRAPH_EDGE_TYPES,
  GRAPH_NODE_TYPES,
  graphEdgeEvidenceSchema,
  graphEdgeSchema,
  parseRelationshipGraph,
  RELATIONSHIP_GRAPH_SCHEMA_VERSION,
  relatedEdgeId,
  relationshipGraphSchema,
  roundTripRelationshipGraph,
  teamNodeId,
  teamSeasonNodeId,
  type GraphEdge,
  type RelationshipGraph,
} from './relationshipGraph';

describe('relationshipGraph schema', () => {
  it('documents core node and edge type catalogs', () => {
    expect(GRAPH_NODE_TYPES).toEqual(
      expect.arrayContaining([
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
      ]),
    );
    expect(GRAPH_EDGE_TYPES).toEqual(
      expect.arrayContaining([
        'has_season',
        'affiliated_with',
        'participates_in',
        'awarded',
        'links_to',
        'has_repository',
        'related_to',
        'alliance_with',
        'opponent_of',
      ]),
    );
  });

  it('rejects edges missing evidence entirely', () => {
    const result = v.safeParse(graphEdgeSchema, {
      id: 'e1',
      from: 'team:1',
      to: 'team:2',
      type: 'related_to',
    });
    expect(result.success).toBe(false);
  });

  it('rejects evidence missing required source / confidence / confirmationState', () => {
    const missingSource = v.safeParse(graphEdgeEvidenceSchema, {
      retrievedAt: null,
      confidence: 'high',
      confirmationState: 'unconfirmed',
    });
    expect(missingSource.success).toBe(false);

    const missingConfidence = v.safeParse(graphEdgeEvidenceSchema, {
      source: 'test',
      retrievedAt: null,
      confirmationState: 'unconfirmed',
    });
    expect(missingConfidence.success).toBe(false);

    const emptySource = v.safeParse(graphEdgeEvidenceSchema, {
      source: '',
      retrievedAt: null,
      confidence: 'high',
      confirmationState: 'unconfirmed',
    });
    expect(emptySource.success).toBe(false);
  });

  it('accepts a minimal valid edge with required evidence fields', () => {
    const edge: GraphEdge = {
      id: 'related_to:1:2:same_school',
      from: teamNodeId(1),
      to: teamNodeId(2),
      type: 'related_to',
      evidence: {
        source: 'team-lineage',
        retrievedAt: null,
        confidence: 'medium',
        confirmationState: 'unconfirmed',
      },
    };
    const result = v.safeParse(graphEdgeSchema, edge);
    expect(result.success).toBe(true);
  });

  it('round-trips a small graph document through JSON + Valibot', () => {
    const graph: RelationshipGraph = {
      schemaVersion: RELATIONSHIP_GRAPH_SCHEMA_VERSION,
      generatedAt: '2026-08-16T00:00:00.000Z',
      label: 'test',
      nodes: [
        { id: teamNodeId(16158), type: 'team', label: '16158 VC Silver Circuits' },
        {
          id: teamSeasonNodeId(16158, 2025),
          type: 'team_season',
          label: '16158 · 2025',
          refs: { teamNumber: 16158, season: 2025 },
        },
      ],
      edges: [
        {
          id: 'has_season:team:16158:team_season:16158:2025',
          from: teamNodeId(16158),
          to: teamSeasonNodeId(16158, 2025),
          type: 'has_season',
          evidence: {
            source: 'ftc-events-team-page',
            retrievedAt: null,
            confidence: 'high',
            confirmationState: 'unconfirmed',
            url: 'https://ftc-events.firstinspires.org/2025/team/16158',
          },
        },
      ],
    };

    const roundTrip = roundTripRelationshipGraph(graph);
    expect(roundTrip.ok).toBe(true);
    if (roundTrip.ok) {
      expect(roundTrip.data.schemaVersion).toBe(1);
      expect(roundTrip.data.nodes).toHaveLength(2);
      expect(roundTrip.data.edges[0]?.evidence.source).toBe('ftc-events-team-page');
    }

    const parsed = parseRelationshipGraph(JSON.parse(JSON.stringify(graph)));
    expect(parsed.ok).toBe(true);

    const schemaOk = v.safeParse(relationshipGraphSchema, graph);
    expect(schemaOk.success).toBe(true);
  });

  it('rejects graphs that omit evidence on any edge during document parse', () => {
    const parsed = parseRelationshipGraph({
      schemaVersion: 1,
      generatedAt: '2026-08-16T00:00:00.000Z',
      nodes: [],
      edges: [
        {
          id: 'bad',
          from: 'a',
          to: 'b',
          type: 'links_to',
          evidence: { retrievedAt: null, confidence: 'high', confirmationState: 'unconfirmed' },
        },
      ],
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.issues.some((issue) => /source|evidence/i.test(issue.message + issue.path))).toBe(
        true,
      );
    }
  });

  it('builds stable related edge ids regardless of orientation', () => {
    expect(relatedEdgeId(1002, 1001, 'same_school')).toBe(relatedEdgeId(1001, 1002, 'same_school'));
  });
});
