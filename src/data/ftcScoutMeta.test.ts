import { describe, expect, it } from 'vitest';
import {
  isCalculatedScoutStat,
  SCOUT_CALCULATED_LABEL,
  SCOUT_CROSS_SEASON_WARNING,
  SCOUT_DEFAULT_RANKING_SCOPE,
  SCOUT_META_CATALOG_VERSION,
  SCOUT_STAT_DEFINITIONS,
  scoutSampleSizeCaption,
  scoutStatDefinition,
} from './ftcScoutMeta';

describe('ftcScoutMeta catalog v1', () => {
  it('uses catalog version v1 linked to calculated-only definitions', () => {
    expect(SCOUT_META_CATALOG_VERSION).toBe('v1');
    expect(SCOUT_DEFAULT_RANKING_SCOPE).toBe('world');
    expect(SCOUT_STAT_DEFINITIONS.length).toBeGreaterThan(0);
    expect(SCOUT_STAT_DEFINITIONS.every((row) => row.catalogVersion === 'v1')).toBe(true);
    expect(SCOUT_STAT_DEFINITIONS.every((row) => row.kind === 'calculated')).toBe(true);
    expect(SCOUT_STAT_DEFINITIONS.every((row) => row.rankingScope === 'world')).toBe(true);
    expect(SCOUT_STAT_DEFINITIONS.every((row) => row.docsUrl.includes('ftcscout.org'))).toBe(true);
  });

  it('labels calculated stats as non-official for UI copy', () => {
    expect(SCOUT_CALCULATED_LABEL).toMatch(/Calculated \(FTCScout\)/i);
    expect(SCOUT_CALCULATED_LABEL).toMatch(/not official FIRST/i);
    expect(SCOUT_CROSS_SEASON_WARNING).toMatch(/not compare/i);
    expect(isCalculatedScoutStat('season-opr-total')).toBe(true);
    expect(isCalculatedScoutStat('missing-stat')).toBe(false);
    expect(scoutStatDefinition('event-score-spread')?.label).toBe('Score spread');
  });

  it('formats sample size captions and omits empty values', () => {
    expect(scoutSampleSizeCaption(8363)).toBe('Sample size 8,363 teams (world)');
    expect(scoutSampleSizeCaption(0)).toBeNull();
    expect(scoutSampleSizeCaption(null)).toBeNull();
    expect(scoutSampleSizeCaption(undefined)).toBeNull();
  });
});
