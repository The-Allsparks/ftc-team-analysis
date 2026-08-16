import { describe, expect, it } from 'vitest';
import { buildDataChangeReport, formatDataChangeReportMarkdown } from './dataChangeReport';
import { GeneratedData } from './schema';

function snapshot(overrides: Partial<GeneratedData> & Pick<GeneratedData, 'teams' | 'generatedAt'>): GeneratedData {
  return {
    targetSeasons: [2025],
    regionCode: 'USNV',
    regionEvents: [],
    sources: [],
    limitations: [],
    ...overrides,
  };
}

describe('buildDataChangeReport', () => {
  it('summarizes added/removed teams and source failures', () => {
    const previous = snapshot({
      generatedAt: '2026-01-01T00:00:00.000Z',
      teams: [{ number: 1 } as GeneratedData['teams'][number], { number: 2 } as GeneratedData['teams'][number]],
      targetSeasons: [2025],
    });
    const candidate = snapshot({
      generatedAt: '2026-08-16T00:00:00.000Z',
      teams: [{ number: 2 } as GeneratedData['teams'][number], { number: 3 } as GeneratedData['teams'][number]],
      targetSeasons: [2026, 2025],
      sourceChecks: [
        {
          label: 'FTC Events region USNV 2026',
          url: 'https://ftc-events.firstinspires.org/2026/region/USNV',
          checkedAt: '2026-08-16T00:00:00.000Z',
          ok: false,
          detail: 'GET failed with 404',
        },
      ],
    });

    const report = buildDataChangeReport(previous, candidate);
    expect(report.teamsAdded).toEqual([3]);
    expect(report.teamsRemoved).toEqual([1]);
    expect(report.sourceFailures).toHaveLength(1);
    expect(formatDataChangeReportMarkdown(report)).toContain('Teams added: 3');
    expect(formatDataChangeReportMarkdown(report)).toContain('Source failure:');
  });

  it('handles a missing previous snapshot', () => {
    const candidate = snapshot({
      generatedAt: '2026-08-16T00:00:00.000Z',
      teams: [{ number: 1 } as GeneratedData['teams'][number]],
    });
    const report = buildDataChangeReport(null, candidate);
    expect(report.teamCountPrevious).toBeNull();
    expect(report.teamsAdded).toEqual([1]);
  });
});
