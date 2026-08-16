import { describe, expect, it } from 'vitest';
import type { FieldEvidence, TeamSeason } from '../data/schema';
import {
  buildSeasonEvidence,
  createEvidence,
  currentEvidenceForField,
  evidenceForField,
  evidenceForSeason,
  evidenceForSeasonField,
  formatObservationScopeLabel,
  formatProvenanceSummary,
  mergeSeasonEvidence,
  observationScopeLabel,
  recordObservation,
  synthesizeSeasonEvidence,
} from './fieldEvidence';

const baseSeason = {
  season: 2025 as const,
  name: 'VC Silver Circuits',
  location: 'Virginia City Highlands, NV, USA',
  organization: 'Tesla&Family/Community',
  website: 'https://www.vcsilvercircuits.com',
  record: { wins: 32, losses: 11, ties: 0, text: '32-11-0' },
  qualificationRecord: { wins: 27, losses: 7, ties: 0, text: '27-7-0' },
  playoffRecord: null,
  rookieYear: 2018,
  league: 'Northern Nevada',
  region: 'Nevada',
  robot: 'Vestige',
  teamType: 'non-school' as const,
  sourceUrl: 'https://ftc-events.firstinspires.org/2025/team/16158',
};

function obs(
  field: FieldEvidence['field'],
  value: string,
  sourceType: string,
  extras: Partial<FieldEvidence> = {},
): FieldEvidence {
  return createEvidence({
    field,
    value,
    sourceType,
    sourceUrl: 'https://example.test/a',
    retrievedAt: '2026-01-01T00:00:00.000Z',
    observedSeason: 2025,
    extractionMethod: 'test',
    ...extras,
  });
}

describe('fieldEvidence', () => {
  it('retains two sources for the same field when values differ (conflict mode)', () => {
    const first = obs('name', 'Alpha Robotics', 'first-search');
    const second = obs('name', 'Alpha Robotics NV', 'ftc-events-team-page', {
      retrievedAt: '2026-02-01T00:00:00.000Z',
    });

    const merged = recordObservation([first], second, 'conflict');
    const names = evidenceForField(merged, 'name');

    expect(names).toHaveLength(2);
    expect(names.filter((row) => row.status === 'current')).toHaveLength(1);
    expect(names.filter((row) => row.status === 'conflicting')).toHaveLength(1);
    expect(names.map((row) => row.value).sort()).toEqual(['Alpha Robotics', 'Alpha Robotics NV']);
  });

  it('marks prior current value as superseded and links supersedesId', () => {
    const first = obs('location', 'Reno, NV, USA', 'first-search');
    const second = obs('location', 'Sparks, NV, USA', 'ftc-events-team-page', {
      retrievedAt: '2026-03-01T00:00:00.000Z',
    });

    const merged = recordObservation([first], second, 'supersede');
    const current = currentEvidenceForField(merged, 'location');
    const prior = evidenceForField(merged, 'location').find((row) => row.status === 'superseded');

    expect(current).toHaveLength(1);
    expect(current[0]?.value).toBe('Sparks, NV, USA');
    expect(prior?.value).toBe('Reno, NV, USA');
    expect(current[0]?.supersedesId).toBe(first.id);
  });

  it('does not duplicate identical current values on merge', () => {
    const first = obs('website', 'https://example.org', 'ftc-events-team-page');
    const second = obs('website', 'https://example.org', 'ftc-events-team-page', {
      retrievedAt: '2026-04-01T00:00:00.000Z',
    });

    const merged = mergeSeasonEvidence([first], [second]);
    expect(evidenceForField(merged, 'website')).toHaveLength(1);
    expect(currentEvidenceForField(merged, 'website')[0]?.retrievedAt).toBe('2026-04-01T00:00:00.000Z');
  });

  it('buildSeasonEvidence marks teamType as derived and includes competitive records', () => {
    const rows = buildSeasonEvidence(baseSeason, {
      sourceType: 'ftc-events-team-page',
      sourceUrl: baseSeason.sourceUrl,
      retrievedAt: '2026-05-01T00:00:00.000Z',
      extractionMethod: 'html-field',
    });

    expect(currentEvidenceForField(rows, 'name')[0]?.kind).toBe('observed');
    expect(currentEvidenceForField(rows, 'organization')[0]?.rawValue).toBe(baseSeason.organization);
    expect(currentEvidenceForField(rows, 'record')[0]?.value).toBe('32-11-0');
    expect(currentEvidenceForField(rows, 'qualificationRecord')[0]?.value).toBe('27-7-0');
    expect(currentEvidenceForField(rows, 'playoffRecord')).toHaveLength(0);
    expect(currentEvidenceForField(rows, 'teamType')[0]).toMatchObject({
      kind: 'derived',
      sourceType: 'derived',
      value: 'non-school',
    });
  });

  it('synthesizeSeasonEvidence uses first-search when notes mention Team Search', () => {
    const season = {
      ...baseSeason,
      active: true,
      city: null,
      state: 'NV',
      country: 'USA',
      affiliations: [],
      summary: null,
      events: [],
      awards: [],
      notes: ['Team seeded from public FIRST Team Search because FTC Events pages are unavailable.'],
    } satisfies TeamSeason;

    const rows = synthesizeSeasonEvidence(season);
    expect(currentEvidenceForField(rows, 'name')[0]?.sourceType).toBe('first-search');
    expect(currentEvidenceForField(rows, 'name')[0]?.extractionMethod).toBe('search-index');
  });

  it('evidenceForSeason derives on read when stored evidence is missing', () => {
    const season = {
      ...baseSeason,
      active: true,
      city: null,
      state: 'NV',
      country: 'USA',
      affiliations: [],
      summary: null,
      events: [],
      awards: [],
      notes: [],
    } satisfies TeamSeason;

    const derived = evidenceForSeason(season);
    expect(season.evidence).toBeUndefined();
    expect(evidenceForSeasonField(season, 'name')[0]).toMatchObject({
      field: 'name',
      value: 'VC Silver Circuits',
      status: 'current',
      sourceUrl: baseSeason.sourceUrl,
    });
    expect(derived.some((row) => row.field === 'organization')).toBe(true);
  });

  it('evidenceForSeason prefers stored evidence over synthesize', () => {
    const stored = [
      createEvidence({
        field: 'name',
        value: 'Stored Name',
        sourceType: 'ftc-events-team-page',
        sourceUrl: baseSeason.sourceUrl,
        retrievedAt: '2026-06-01T00:00:00.000Z',
        observedSeason: 2025,
        extractionMethod: 'html-title',
      }),
    ];
    const season = {
      ...baseSeason,
      active: true,
      city: null,
      state: 'NV',
      country: 'USA',
      affiliations: [],
      summary: null,
      events: [],
      awards: [],
      notes: [],
      evidence: stored,
    } satisfies TeamSeason;

    expect(evidenceForSeason(season)).toEqual(stored);
    expect(evidenceForSeasonField(season, 'name')[0]?.value).toBe('Stored Name');
  });

  it('formatProvenanceSummary exposes source and conflict counts for UI smoke', () => {
    const first = obs('name', 'A', 'first-search');
    const second = obs('name', 'B', 'ftc-events-team-page');
    const rows = recordObservation([first], second, 'conflict');
    const summary = formatProvenanceSummary(rows);
    expect(summary).toMatch(/ftc events team page/i);
    expect(summary).toMatch(/conflicting/i);
  });

  it('labels current vs season vs historical observation scopes for UI', () => {
    expect(formatObservationScopeLabel('current')).toBe('Current');
    expect(formatObservationScopeLabel('season')).toBe('Observed this season');
    expect(formatObservationScopeLabel('historical')).toBe('Previously observed');

    const current = obs('name', 'Now', 'ftc-events-team-page');
    const prior = { ...obs('name', 'Then', 'ftc-events-team-page'), status: 'superseded' as const };
    expect(observationScopeLabel(current)).toBe('season');
    expect(observationScopeLabel(current, { isProfileCurrent: true })).toBe('current');
    expect(observationScopeLabel(prior)).toBe('historical');
  });

  it('buildSeasonEvidence includes active presence', () => {
    const rows = buildSeasonEvidence(
      { ...baseSeason, active: true },
      {
        sourceType: 'ftc-events-team-page',
        sourceUrl: baseSeason.sourceUrl,
        retrievedAt: '2026-05-01T00:00:00.000Z',
      },
    );
    expect(currentEvidenceForField(rows, 'active')[0]?.value).toBe('true');
  });
});
