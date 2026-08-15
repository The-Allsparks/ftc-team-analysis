import { describe, expect, it } from 'vitest';
import {
  formatScoutIssues,
  parseScoutEvents,
  parseScoutQuickStats,
  SCOUT_EVENTS_NOT_ARRAY,
  SCOUT_QUICK_STATS_NOT_OBJECT,
  scoutEventsAllQuarantinedMessage,
} from './ftcScoutSchema';

const sampleQuickStats = {
  season: 2025,
  number: 16158,
  tot: { value: 100, rank: 1 },
  auto: { value: 40, rank: 2 },
  dc: { value: 40, rank: 3 },
  eg: { value: 20, rank: 4 },
  count: 10,
};

const sampleEvent = {
  season: 2025,
  eventCode: 'USNVCMP',
  teamNumber: 16158,
  stats: null,
};

describe('parseScoutQuickStats', () => {
  it('accepts a valid fixture and ignores unknown fields', () => {
    const result = parseScoutQuickStats({ ...sampleQuickStats, extra: true });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.tot.value).toBe(100);
    expect(result.data.number).toBe(16158);
  });

  it('accepts null or omitted ranks before normalize', () => {
    const result = parseScoutQuickStats({
      ...sampleQuickStats,
      tot: { value: 100, rank: null },
      auto: { value: 40 },
    });
    expect(result.ok).toBe(true);
  });

  it('fails closed when the payload is not an object', () => {
    expect(parseScoutQuickStats([])).toEqual({
      ok: false,
      issues: [{ path: '(root)', message: SCOUT_QUICK_STATS_NOT_OBJECT }],
    });
    expect(parseScoutQuickStats(null).ok).toBe(false);
  });

  it('fails closed when required stat values are missing or wrong type', () => {
    const fixture = structuredClone(sampleQuickStats);
    (fixture.tot as { value: unknown }).value = '100';

    const result = parseScoutQuickStats(fixture);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.issues.some((issue) => issue.path.includes('tot'))).toBe(true);
    expect(formatScoutIssues(result.issues).length).toBeGreaterThan(0);
  });
});

describe('parseScoutEvents', () => {
  it('accepts a valid events array', () => {
    const result = parseScoutEvents([sampleEvent]);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data).toHaveLength(1);
    expect(result.quarantined).toEqual([]);
    expect(result.quarantinedRecordCount).toBe(0);
  });

  it('fails closed when the envelope is not an array', () => {
    expect(parseScoutEvents({ events: [] })).toEqual({
      ok: false,
      kind: 'invalid-envelope',
      issues: [{ path: '(root)', message: SCOUT_EVENTS_NOT_ARRAY }],
    });
  });

  it('quarantines one invalid event and keeps the rest', () => {
    const result = parseScoutEvents([
      sampleEvent,
      { season: 2025, eventCode: 123, teamNumber: 16158, stats: null },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.eventCode).toBe('USNVCMP');
    expect(result.quarantinedRecordCount).toBe(1);
    expect(result.quarantined.length).toBeGreaterThan(0);
    expect(result.quarantined.some((issue) => issue.path.includes('[1]'))).toBe(true);
  });

  it('fails closed when every event is quarantined', () => {
    const result = parseScoutEvents([
      { season: '2025', eventCode: 'USNVCMP', teamNumber: 16158, stats: null },
      { season: 2025, eventCode: null, teamNumber: 16158, stats: null },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.kind).toBe('all-quarantined');
    expect(result.issues[0]).toEqual({
      path: '(root)',
      message: scoutEventsAllQuarantinedMessage(2),
    });
  });

  it('accepts an empty events array without quarantine', () => {
    const result = parseScoutEvents([]);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data).toEqual([]);
    expect(result.quarantined).toEqual([]);
    expect(result.quarantinedRecordCount).toBe(0);
  });
});
