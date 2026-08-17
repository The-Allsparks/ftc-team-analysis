import { describe, expect, it } from 'vitest';
import {
  buildDirectoryDataFromTree,
  isSummaryOnlySeason,
  isTeamSeasonDetailLoaded,
  mergeRegionSummaryIntoData,
  mergeTeamSeasonDetail,
  SUMMARY_ONLY_NOTE,
} from './snapshotDirectory';
import type { RegionSeasonSummary, SnapshotManifest } from './snapshotTreeSchema';
import type { TeamSeason } from './schema';

const manifest: SnapshotManifest = {
  schemaVersion: 1,
  generatedAt: '2026-08-16T00:00:00.000Z',
  treeGeneratedAt: '2026-08-16T01:00:00.000Z',
  regionCode: 'USNV',
  regionLabel: 'Nevada',
  currentSeason: 2026,
  seasons: [2026, 2025],
  teamCount: 2,
  teams: [
    { number: 1, latestName: 'Alpha', path: '/data/teams/1/index.json' },
    { number: 2, latestName: 'Beta', path: '/data/teams/2/index.json' },
  ],
  paths: {
    megaSeed: '/data/nv-ftc-teams.generated.json',
    observations: '/data/nv-ftc-team-observations.generated.json',
    sourceHealth: '/data/source-health.json',
    regionSummary: '/data/regions/{region}/{season}/summary.json',
    teamIndex: '/data/teams/{number}/index.json',
    teamSeason: '/data/teams/{number}/{season}.json',
  },
  cachePolicy: {
    historicalMaxAgeSeconds: 1,
    currentMaxAgeSeconds: 1,
    megaSeedMaxAgeSeconds: 1,
    note: 'test',
  },
};

const summary2026: RegionSeasonSummary = {
  schemaVersion: 1,
  regionCode: 'USNV',
  season: 2026,
  generatedAt: '2026-08-16T00:00:00.000Z',
  teamCount: 1,
  teams: [
    {
      number: 1,
      name: 'Alpha 2026',
      location: 'Reno, NV, USA',
      teamType: 'school',
      league: 'North',
      city: 'Reno',
      active: true,
    },
  ],
};

const summary2025: RegionSeasonSummary = {
  schemaVersion: 1,
  regionCode: 'USNV',
  season: 2025,
  generatedAt: '2026-08-16T00:00:00.000Z',
  teamCount: 2,
  teams: [
    {
      number: 1,
      name: 'Alpha 2025',
      location: 'Reno, NV, USA',
      teamType: 'school',
      league: 'North',
      city: 'Reno',
      active: true,
    },
    {
      number: 2,
      name: 'Beta 2025',
      location: 'Las Vegas, NV, USA',
      teamType: 'non-school',
      league: null,
      city: 'Las Vegas',
      active: true,
    },
  ],
};

function fullSeason(partial: Partial<TeamSeason> & Pick<TeamSeason, 'season' | 'name'>): TeamSeason {
  return {
    active: true,
    location: 'Reno, NV, USA',
    city: 'Reno',
    state: 'NV',
    country: 'USA',
    region: 'Nevada',
    league: null,
    rookieYear: 2020,
    organization: 'Org',
    teamType: 'school',
    website: null,
    robot: null,
    sourceUrl: 'https://example.test',
    summary: null,
    record: null,
    qualificationRecord: null,
    playoffRecord: null,
    events: [{ code: 'USNV', name: 'Event', dateRange: null, eventOrder: null, location: null, league: null, rank: null, totalPoints: null, matchCount: 0, rankingScore: null, leagueSeasonRank: null, leagueSeasonRankTotal: null, qualificationUrl: null, playoffUrl: null, playoffRecord: null, allianceSelection: null, sourceUrl: null }],
    awards: [],
    notes: [],
    ...partial,
  };
}

describe('snapshotDirectory', () => {
  it('builds directory data from manifest + summaries without full detail', () => {
    const data = buildDirectoryDataFromTree(manifest, [summary2026, summary2025]);

    expect(data.regionCode).toBe('USNV');
    expect(data.teams).toHaveLength(2);
    expect(data.teams[0]?.seasons[2026]).toBeTruthy();
    expect(isSummaryOnlySeason(data.teams[0]?.seasons[2026])).toBe(true);
    expect(data.teams[0]?.seasons[2026]?.notes).toContain(SUMMARY_ONLY_NOTE);
    expect(data.teams[0]?.seasons[2026]?.events).toEqual([]);
    expect(isTeamSeasonDetailLoaded(data.teams[0], 2026)).toBe(false);
  });

  it('merges full team-season detail over summary stubs', () => {
    const shell = buildDirectoryDataFromTree(manifest, [summary2026]);
    const detail = fullSeason({ season: 2026, name: 'Alpha Full' });
    const next = mergeTeamSeasonDetail(shell, 1, detail, { latestWebsite: 'https://example.org' });

    expect(isSummaryOnlySeason(next.teams[0]?.seasons[2026])).toBe(false);
    expect(isTeamSeasonDetailLoaded(next.teams[0], 2026)).toBe(true);
    expect(next.teams[0]?.seasons[2026]?.events).toHaveLength(1);
    expect(next.teams[0]?.latestWebsite).toBe('https://example.org');
    expect(next.teams[0]?.latestName).toBe('Alpha Full');
  });

  it('copies team-level links from the snapshot index when merging detail', () => {
    const shell = buildDirectoryDataFromTree(manifest, [summary2026]);
    expect(shell.teams[0]?.links).toEqual([]);

    const detail = fullSeason({ season: 2026, name: 'Alpha Full' });
    const next = mergeTeamSeasonDetail(shell, 1, detail, {
      links: [
        {
          type: 'website',
          label: 'Team site',
          url: 'https://example-team.example',
          source: 'FTC Events',
        },
      ],
    });

    expect(next.teams[0]?.links).toEqual([
      {
        type: 'website',
        label: 'Team site',
        url: 'https://example-team.example',
        source: 'FTC Events',
      },
    ]);
  });

  it('does not wipe existing links when the snapshot index has an empty links array', () => {
    const shell = buildDirectoryDataFromTree(manifest, [summary2026]);
    const withLinks = {
      ...shell,
      teams: shell.teams.map((team) =>
        team.number === 1
          ? {
              ...team,
              links: [
                {
                  type: 'website' as const,
                  label: 'Kept site',
                  url: 'https://kept.example',
                  source: 'Mega seed',
                },
              ],
            }
          : team,
      ),
    };
    const detail = fullSeason({ season: 2026, name: 'Alpha Full' });
    const next = mergeTeamSeasonDetail(withLinks, 1, detail, { links: [] });

    expect(next.teams[0]?.links).toEqual([
      {
        type: 'website',
        label: 'Kept site',
        url: 'https://kept.example',
        source: 'Mega seed',
      },
    ]);
  });

  it('merges an additional region summary into existing directory data', () => {
    const shell = buildDirectoryDataFromTree(manifest, [summary2025]);
    expect(shell.teams.some((team) => team.seasons[2026])).toBe(false);

    const next = mergeRegionSummaryIntoData(shell, summary2026);
    expect(next.teams.find((team) => team.number === 1)?.seasons[2026]).toBeTruthy();
    expect(isSummaryOnlySeason(next.teams.find((team) => team.number === 1)?.seasons[2026])).toBe(true);
  });
});
