/**
 * Runtime schemas for Portfolio Lab catalog entries and `/api/search` hits.
 *
 * Invalid catalog rows are quarantined; extract / envelope / all-quarantined
 * failures are hard parse failures (mapped to SourceResult `parse_failure`).
 */
import * as v from 'valibot';
import { PortfolioLabEntry } from './portfolioLab';

export type PortfolioLabIssue = {
  path: string;
  message: string;
  teamNumber?: number;
};

export type PortfolioLabSearchHit = {
  id: string;
  teamName: string;
  teamNumber: number;
  country: string;
};

export type ParsePortfolioLabEntriesResult =
  | {
      ok: true;
      data: PortfolioLabEntry[];
      quarantined: PortfolioLabIssue[];
      quarantinedRecordCount: number;
    }
  | { ok: false; kind: 'invalid-envelope' | 'all-quarantined'; issues: PortfolioLabIssue[] };

export type ParsePortfolioLabSearchResult =
  | { ok: true; data: PortfolioLabSearchHit[] }
  | { ok: false; issues: PortfolioLabIssue[] };

export const PORTFOLIO_LAB_ENTRIES_NOT_ARRAY = 'Portfolio Lab catalog payload is not an array.';
export const PORTFOLIO_LAB_SEARCH_NOT_ARRAY = 'Portfolio Lab search payload is not an array.';

export function portfolioLabEntriesAllQuarantinedMessage(count: number): string {
  return `Portfolio Lab catalog has no valid records; ${count} invalid portfolio(s) were quarantined.`;
}

const stringPairSchema = v.tuple([v.string(), v.string()]);

const portfolioLabEntrySchema = v.looseObject({
  id: v.pipe(v.string(), v.minLength(1)),
  teamName: v.pipe(v.string(), v.minLength(1)),
  teamNumber: v.number(),
  country: v.pipe(v.string(), v.minLength(1)),
  city: v.optional(v.string()),
  season: v.pipe(v.string(), v.minLength(1)),
  level: v.pipe(v.string(), v.minLength(1)),
  stars: v.string(),
  score: v.string(),
  award: v.string(),
  cover: v.optional(v.string()),
  pdf: v.pipe(v.string(), v.minLength(1)),
  summary: v.string(),
  awardsBreakdown: v.optional(v.array(stringPairSchema)),
  criteria: v.optional(v.array(stringPairSchema)),
  strengths: v.optional(v.array(v.string())),
  weaknesses: v.optional(v.array(v.string())),
  improvements: v.optional(v.array(v.string())),
  benchmarkComparison: v.optional(v.string()),
  source: v.optional(v.string()),
});

const portfolioLabSearchHitSchema = v.looseObject({
  id: v.pipe(v.string(), v.minLength(1)),
  teamName: v.pipe(v.string(), v.minLength(1)),
  teamNumber: v.number(),
  country: v.pipe(v.string(), v.minLength(1)),
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function issuePath(issue: v.BaseIssue<unknown>, prefix = ''): string {
  const suffix = (issue.path ?? [])
    .map((item) => (typeof item.key === 'number' ? `[${item.key}]` : `.${String(item.key)}`))
    .join('');
  return `${prefix}${suffix}`.replace(/^\./, '') || '(root)';
}

function issuesFromValibot(
  issues: [v.BaseIssue<unknown>, ...v.BaseIssue<unknown>[]],
  prefix = '',
  teamNumber?: number,
): PortfolioLabIssue[] {
  return issues.map((issue) => ({
    path: issuePath(issue, prefix),
    message: issue.message,
    ...(teamNumber !== undefined ? { teamNumber } : {}),
  }));
}

function readTeamNumber(value: unknown): number | undefined {
  if (!isPlainObject(value) || typeof value.teamNumber !== 'number' || !Number.isFinite(value.teamNumber)) {
    return undefined;
  }
  return value.teamNumber;
}

export function formatPortfolioLabIssues(issues: PortfolioLabIssue[]): string {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
}

function toPortfolioLabEntry(row: v.InferOutput<typeof portfolioLabEntrySchema>): PortfolioLabEntry {
  return {
    id: row.id,
    teamName: row.teamName,
    teamNumber: row.teamNumber,
    country: row.country,
    ...(row.city !== undefined ? { city: row.city } : {}),
    season: row.season,
    level: row.level,
    stars: row.stars,
    score: row.score,
    award: row.award,
    ...(row.cover !== undefined ? { cover: row.cover } : {}),
    pdf: row.pdf,
    summary: row.summary,
    ...(row.awardsBreakdown !== undefined ? { awardsBreakdown: row.awardsBreakdown } : {}),
    ...(row.criteria !== undefined ? { criteria: row.criteria } : {}),
    ...(row.strengths !== undefined ? { strengths: row.strengths } : {}),
    ...(row.weaknesses !== undefined ? { weaknesses: row.weaknesses } : {}),
    ...(row.improvements !== undefined ? { improvements: row.improvements } : {}),
    ...(row.benchmarkComparison !== undefined ? { benchmarkComparison: row.benchmarkComparison } : {}),
    ...(row.source !== undefined ? { source: row.source } : {}),
  };
}

export function parsePortfolioLabEntries(raw: unknown): ParsePortfolioLabEntriesResult {
  if (!Array.isArray(raw)) {
    return {
      ok: false,
      kind: 'invalid-envelope',
      issues: [{ path: '(root)', message: PORTFOLIO_LAB_ENTRIES_NOT_ARRAY }],
    };
  }

  const valid: PortfolioLabEntry[] = [];
  const quarantined: PortfolioLabIssue[] = [];
  let quarantinedRecordCount = 0;

  raw.forEach((value, index) => {
    const parsed = v.safeParse(portfolioLabEntrySchema, value);
    const teamNumber = readTeamNumber(value);
    if (parsed.success) {
      valid.push(toPortfolioLabEntry(parsed.output));
      return;
    }
    quarantinedRecordCount += 1;
    quarantined.push(...issuesFromValibot(parsed.issues, `[${index}]`, teamNumber));
  });

  if (raw.length > 0 && valid.length === 0) {
    return {
      ok: false,
      kind: 'all-quarantined',
      issues: [
        { path: '(root)', message: portfolioLabEntriesAllQuarantinedMessage(raw.length) },
        ...quarantined,
      ],
    };
  }

  return { ok: true, data: valid, quarantined, quarantinedRecordCount };
}

export function parsePortfolioLabSearchHits(raw: unknown): ParsePortfolioLabSearchResult {
  if (!Array.isArray(raw)) {
    return {
      ok: false,
      issues: [{ path: '(root)', message: PORTFOLIO_LAB_SEARCH_NOT_ARRAY }],
    };
  }

  const valid: PortfolioLabSearchHit[] = [];
  const quarantined: PortfolioLabIssue[] = [];

  raw.forEach((value, index) => {
    const parsed = v.safeParse(portfolioLabSearchHitSchema, value);
    if (parsed.success) {
      valid.push({
        id: parsed.output.id,
        teamName: parsed.output.teamName,
        teamNumber: parsed.output.teamNumber,
        country: parsed.output.country,
      });
      return;
    }
    quarantined.push(...issuesFromValibot(parsed.issues, `[${index}]`, readTeamNumber(value)));
  });

  if (raw.length > 0 && valid.length === 0) {
    return {
      ok: false,
      issues: [
        {
          path: '(root)',
          message: `Portfolio Lab search has no valid records; ${raw.length} invalid hit(s) were quarantined.`,
        },
        ...quarantined,
      ],
    };
  }

  return { ok: true, data: valid };
}
