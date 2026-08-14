import { describe, expect, it } from 'vitest';
import {
  PUBLISH_GUARD_EMPTY,
  PUBLISH_GUARD_NOT_OBJECT,
  assertSafeToPublishGeneratedData,
  evaluateGeneratedDataPublish,
  publishGuardDropMessage,
} from './publishGuard';

function dataWithTeams(count: number) {
  return { teams: Array.from({ length: count }, (_, index) => ({ number: index + 1 })) };
}

describe('evaluateGeneratedDataPublish', () => {
  it('allows a valid refresh that does not drop below 50%', () => {
    const result = evaluateGeneratedDataPublish(dataWithTeams(20), dataWithTeams(15));
    expect(result).toEqual({ ok: true });
    expect(() => assertSafeToPublishGeneratedData(dataWithTeams(20), dataWithTeams(15))).not.toThrow();
  });

  it('allows a valid candidate when previous is missing', () => {
    expect(evaluateGeneratedDataPublish(null, dataWithTeams(5))).toEqual({ ok: true });
  });

  it('allows a drop below 50% when previous has fewer than 10 teams', () => {
    expect(evaluateGeneratedDataPublish(dataWithTeams(8), dataWithTeams(3))).toEqual({ ok: true });
  });

  it('allows a drop that is exactly 50% of previous', () => {
    expect(evaluateGeneratedDataPublish(dataWithTeams(10), dataWithTeams(5))).toEqual({ ok: true });
  });

  it('rejects an empty teams array', () => {
    const result = evaluateGeneratedDataPublish(dataWithTeams(20), dataWithTeams(0));
    expect(result).toEqual({ ok: false, reason: PUBLISH_GUARD_EMPTY });
    expect(() => assertSafeToPublishGeneratedData(dataWithTeams(20), dataWithTeams(0))).toThrow(PUBLISH_GUARD_EMPTY);
  });

  it('rejects a sharp reduction below 50% when previous has at least 10 teams', () => {
    const result = evaluateGeneratedDataPublish(dataWithTeams(20), dataWithTeams(9));
    expect(result).toEqual({
      ok: false,
      reason: publishGuardDropMessage(20, 9),
    });
  });

  it('rejects a non-object or missing teams array', () => {
    expect(evaluateGeneratedDataPublish(dataWithTeams(20), null)).toEqual({
      ok: false,
      reason: PUBLISH_GUARD_NOT_OBJECT,
    });
    expect(evaluateGeneratedDataPublish(dataWithTeams(20), [])).toEqual({
      ok: false,
      reason: PUBLISH_GUARD_NOT_OBJECT,
    });
    expect(evaluateGeneratedDataPublish(dataWithTeams(20), { teams: 'nope' })).toEqual({
      ok: false,
      reason: PUBLISH_GUARD_NOT_OBJECT,
    });
    expect(evaluateGeneratedDataPublish(dataWithTeams(20), { generatedAt: '2026-01-01' })).toEqual({
      ok: false,
      reason: PUBLISH_GUARD_NOT_OBJECT,
    });
  });
});
