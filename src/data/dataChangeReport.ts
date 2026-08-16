import { GeneratedData, SourceCheck } from './schema';

export type DataChangeReport = {
  generatedAtPrevious: string | null;
  generatedAtCandidate: string;
  teamCountPrevious: number | null;
  teamCountCandidate: number;
  teamsAdded: number[];
  teamsRemoved: number[];
  targetSeasonsPrevious: number[];
  targetSeasonsCandidate: number[];
  sourceChecks: SourceCheck[];
  sourceFailures: SourceCheck[];
  summaryLines: string[];
};

function isGeneratedLike(value: unknown): value is GeneratedData {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Array.isArray((value as GeneratedData).teams) &&
    typeof (value as GeneratedData).generatedAt === 'string'
  );
}

function teamNumbers(data: GeneratedData): Set<number> {
  return new Set(data.teams.map((team) => team.number));
}

/** Build a human-readable change report between previous and candidate snapshots. */
export function buildDataChangeReport(
  previous: unknown | null,
  candidate: GeneratedData,
): DataChangeReport {
  const prev = isGeneratedLike(previous) ? previous : null;
  const prevNumbers = prev ? teamNumbers(prev) : new Set<number>();
  const nextNumbers = teamNumbers(candidate);

  const teamsAdded = [...nextNumbers].filter((number) => !prevNumbers.has(number)).sort((a, b) => a - b);
  const teamsRemoved = [...prevNumbers].filter((number) => !nextNumbers.has(number)).sort((a, b) => a - b);
  const sourceChecks = candidate.sourceChecks ?? [];
  const sourceFailures = sourceChecks.filter((check) => !check.ok);

  const summaryLines = [
    `Generated: ${prev?.generatedAt ?? '(none)'} → ${candidate.generatedAt}`,
    `Teams: ${prev?.teams.length ?? '(none)'} → ${candidate.teams.length}` +
      (teamsAdded.length || teamsRemoved.length
        ? ` (added ${teamsAdded.length}, removed ${teamsRemoved.length})`
        : ''),
    `Target seasons: [${(prev?.targetSeasons ?? []).join(', ')}] → [${candidate.targetSeasons.join(', ')}]`,
    `Source checks: ${sourceChecks.length} total, ${sourceFailures.length} failed`,
  ];

  if (teamsAdded.length > 0) {
    summaryLines.push(`Teams added: ${teamsAdded.join(', ')}`);
  }
  if (teamsRemoved.length > 0) {
    summaryLines.push(`Teams removed: ${teamsRemoved.join(', ')}`);
  }
  for (const failure of sourceFailures) {
    summaryLines.push(`Source failure: ${failure.label} (${failure.url}) — ${failure.detail ?? 'failed'}`);
  }

  return {
    generatedAtPrevious: prev?.generatedAt ?? null,
    generatedAtCandidate: candidate.generatedAt,
    teamCountPrevious: prev?.teams.length ?? null,
    teamCountCandidate: candidate.teams.length,
    teamsAdded,
    teamsRemoved,
    targetSeasonsPrevious: prev?.targetSeasons ?? [],
    targetSeasonsCandidate: [...candidate.targetSeasons],
    sourceChecks,
    sourceFailures,
    summaryLines,
  };
}

export function formatDataChangeReportMarkdown(report: DataChangeReport): string {
  const lines = [
    '# Data refresh change report',
    '',
    ...report.summaryLines.map((line) => `- ${line}`),
    '',
  ];
  return `${lines.join('\n')}\n`;
}
