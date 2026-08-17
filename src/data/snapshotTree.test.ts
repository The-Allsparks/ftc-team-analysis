import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGeneratedSeed } from './generatedSeedSchema';
import { CURRENT_SEASON } from './seasons';
import { buildSnapshotTree, formatSizeComparisonMarkdown, formatSizeLabel, ISSUE_38_SIZE_BASELINE } from './snapshotTree';
import {
  parseRegionSeasonSummary,
  parseSnapshotManifest,
  parseSnapshotSourceHealth,
  parseTeamSeasonSnapshot,
  parseTeamSnapshotIndex,
  SNAPSHOT_TREE_SCHEMA_VERSION,
} from './snapshotTreeSchema';
import { PUBLISH_GUARD_EMPTY, evaluateGeneratedDataPublish } from './publishGuard';
import { assertSafeToPublishGeneratedData } from './publishGuard';

const SEED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'nv-ftc-teams.generated.json');

function tinySeed() {
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    targetSeasons: [2025, 2024] as const,
    regionCode: 'USNV',
    regionLabel: 'Nevada',
    teams: [
      {
        number: 1,
        latestName: 'Alpha',
        latestLocation: 'Reno, NV, USA',
        latestCity: 'Reno',
        latestState: 'NV',
        latestCountry: 'USA',
        latestRookieYear: 2020,
        latestOrganization: null,
        latestWebsite: null,
        latestTeamType: 'school' as const,
        latestLeague: null,
        latestRegion: 'Nevada',
        links: [],
        seasons: {
          2025: {
            season: 2025 as const,
            active: true,
            name: 'Alpha',
            location: 'Reno, NV, USA',
            city: 'Reno',
            state: 'NV',
            country: 'USA',
            region: 'Nevada',
            league: null,
            rookieYear: 2020,
            organization: null,
            teamType: 'school' as const,
            website: null,
            robot: null,
            sourceUrl: 'https://ftc-events.firstinspires.org/2025/team/1',
            summary: null,
            record: null,
            qualificationRecord: null,
            playoffRecord: null,
            events: [],
            awards: [],
            notes: [],
          },
          2024: {
            season: 2024 as const,
            active: true,
            name: 'Alpha',
            location: 'Reno, NV, USA',
            city: 'Reno',
            state: 'NV',
            country: 'USA',
            region: 'Nevada',
            league: 'North',
            rookieYear: 2020,
            organization: null,
            teamType: 'school' as const,
            website: null,
            robot: null,
            sourceUrl: 'https://ftc-events.firstinspires.org/2024/team/1',
            summary: null,
            record: null,
            qualificationRecord: null,
            playoffRecord: null,
            events: [],
            awards: [],
            notes: [],
          },
        },
      },
    ],
    regionEvents: [],
    sources: [
      {
        label: 'FTC Events',
        url: 'https://ftc-events.firstinspires.org/',
        note: 'Public pages',
      },
    ],
    limitations: ['test'],
    sourceChecks: [
      {
        label: 'FTC Events',
        url: 'https://ftc-events.firstinspires.org/',
        checkedAt: '2026-01-01T00:00:00.000Z',
        ok: true,
      },
    ],
  };
}

describe('snapshot tree', () => {
  it('builds a Valibot-valid manifest, summaries, and team files from a fixture', () => {
    const parsed = parseGeneratedSeed(tinySeed());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const built = buildSnapshotTree(parsed.data, '2026-01-02T00:00:00.000Z');
    const manifest = parseSnapshotManifest(built.manifest);
    expect(manifest.ok).toBe(true);
    if (!manifest.ok) {
      return;
    }
    expect(manifest.data.schemaVersion).toBe(SNAPSHOT_TREE_SCHEMA_VERSION);
    expect(manifest.data.currentSeason).toBe(CURRENT_SEASON);
    expect(manifest.data.teamCount).toBe(1);
    expect(manifest.data.teams[0]?.path).toBe('/data/teams/1/index.json');
    expect(manifest.data.paths.megaSeed).toBe('/data/nv-ftc-teams.generated.json');
    expect(manifest.data.cachePolicy.historicalMaxAgeSeconds).toBeGreaterThan(
      manifest.data.cachePolicy.currentMaxAgeSeconds,
    );

    expect(built.regionSummaries.length).toBeGreaterThanOrEqual(2);
    for (const summary of built.regionSummaries) {
      const ok = parseRegionSeasonSummary(summary);
      expect(ok.ok).toBe(true);
    }

    const index = parseTeamSnapshotIndex(built.teamIndexes[0]);
    expect(index.ok).toBe(true);
    expect(built.teamSeasons).toHaveLength(2);
    for (const seasonFile of built.teamSeasons) {
      expect(parseTeamSeasonSnapshot(seasonFile).ok).toBe(true);
    }

    expect(parseSnapshotSourceHealth(built.sourceHealth).ok).toBe(true);
    expect(built.sourceHealth.sourceChecks).toHaveLength(1);
  });

  it('refuses empty candidates via the same publish guard as mega-seed writes', () => {
    const empty = { ...tinySeed(), teams: [] };
    const result = evaluateGeneratedDataPublish(tinySeed(), empty);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reason).toBe(PUBLISH_GUARD_EMPTY);
    expect(() => assertSafeToPublishGeneratedData(tinySeed(), empty)).toThrow(PUBLISH_GUARD_EMPTY);
  });

  it('re-measures the checked-in mega-seed and keeps a comparison table shape', () => {
    const parsed = parseGeneratedSeed(JSON.parse(readFileSync(SEED_PATH, 'utf8')));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const built = buildSnapshotTree(parsed.data);
    expect(built.manifest.teamCount).toBe(parsed.data.teams.length);
    expect(built.fileCount).toBeGreaterThan(built.manifest.teamCount);
    const markdown = formatSizeComparisonMarkdown(
      [
        {
          form: 'Formatted mega-seed JSON on disk',
          bytes: ISSUE_38_SIZE_BASELINE.formattedBytes,
          label: formatSizeLabel(ISSUE_38_SIZE_BASELINE.formattedBytes),
        },
      ],
      built.manifest.teamCount,
      built.manifest.generatedAt,
    );
    expect(markdown).toContain('#38');
    expect(markdown).toContain('Formatted mega-seed JSON on disk');
  });
});
