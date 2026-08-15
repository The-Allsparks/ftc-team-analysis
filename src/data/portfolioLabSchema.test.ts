import { describe, expect, it } from 'vitest';
import {
  formatPortfolioLabIssues,
  parsePortfolioLabEntries,
  parsePortfolioLabSearchHits,
  PORTFOLIO_LAB_ENTRIES_NOT_ARRAY,
  PORTFOLIO_LAB_SEARCH_NOT_ARRAY,
  portfolioLabEntriesAllQuarantinedMessage,
} from './portfolioLabSchema';

const sampleEntry = {
  id: '99999-1',
  teamName: 'Synthetic Sparks',
  teamNumber: 99999,
  country: 'USA',
  season: '2025 Decode',
  level: 'Regionals',
  stars: '★★★★',
  score: '40 / 55',
  award: 'Think Award Winner',
  pdf: 'https://example.com/portfolios/99999-1.pdf',
  summary: 'Valid synthetic portfolio entry.',
};

describe('parsePortfolioLabEntries', () => {
  it('accepts a valid fixture and ignores unknown fields', () => {
    const result = parsePortfolioLabEntries([{ ...sampleEntry, extra: true }]);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.teamNumber).toBe(99999);
    expect(result.quarantinedRecordCount).toBe(0);
  });

  it('quarantines malformed rows without failing the whole catalog', () => {
    const result = parsePortfolioLabEntries([
      sampleEntry,
      { id: 'bad', teamName: 'Broken', teamNumber: 'nope', country: 'USA' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data).toHaveLength(1);
    expect(result.quarantinedRecordCount).toBe(1);
    expect(result.quarantined.some((issue) => issue.path.startsWith('[1]'))).toBe(true);
  });

  it('fails closed when the payload is not an array', () => {
    expect(parsePortfolioLabEntries({ portfolios: [] })).toEqual({
      ok: false,
      kind: 'invalid-envelope',
      issues: [{ path: '(root)', message: PORTFOLIO_LAB_ENTRIES_NOT_ARRAY }],
    });
  });

  it('fails closed when every row is quarantined', () => {
    const result = parsePortfolioLabEntries([
      { id: 'bad-1', teamNumber: 1 },
      { id: 'bad-2', teamNumber: 2 },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.kind).toBe('all-quarantined');
    expect(result.issues[0]?.message).toBe(portfolioLabEntriesAllQuarantinedMessage(2));
    expect(formatPortfolioLabIssues(result.issues).length).toBeGreaterThan(0);
  });

  it('accepts an empty array as a valid empty catalog', () => {
    const result = parsePortfolioLabEntries([]);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data).toEqual([]);
    expect(result.quarantinedRecordCount).toBe(0);
  });
});

describe('parsePortfolioLabSearchHits', () => {
  it('accepts valid search hits and ignores unknown fields', () => {
    const result = parsePortfolioLabSearchHits([
      { id: '99999-1', teamName: 'Synthetic Sparks', teamNumber: 99999, country: 'USA', extra: 1 },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data).toEqual([
      { id: '99999-1', teamName: 'Synthetic Sparks', teamNumber: 99999, country: 'USA' },
    ]);
  });

  it('fails closed when the payload is not an array', () => {
    expect(parsePortfolioLabSearchHits({})).toEqual({
      ok: false,
      issues: [{ path: '(root)', message: PORTFOLIO_LAB_SEARCH_NOT_ARRAY }],
    });
  });

  it('fails closed when every search hit is invalid', () => {
    const result = parsePortfolioLabSearchHits([{ id: 'x', teamName: 'y' }]);
    expect(result.ok).toBe(false);
  });
});
