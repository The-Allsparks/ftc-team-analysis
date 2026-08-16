import { describe, expect, it } from 'vitest';
import {
  CURRENT_SEASON,
  SUPPORTED_SEASONS,
  availableSeasons,
  currentSeason,
  isSupportedSeason,
  lastAvailableSeason,
  seasonFilterOptions,
} from './seasons';
import { seasonOptions } from './schema';

describe('season model', () => {
  it('exposes an explicit CURRENT_SEASON rather than max(supported)', () => {
    expect(CURRENT_SEASON).toBe(2026);
    expect(currentSeason()).toBe(CURRENT_SEASON);
    expect(SUPPORTED_SEASONS[0]).toBe(CURRENT_SEASON);
  });

  it('derives available seasons from ingested data only', () => {
    const data = {
      targetSeasons: [2025, 2024],
      teams: [{ seasons: { 2024: {}, 2023: {} } }],
    };

    expect(availableSeasons(data)).toEqual([2025, 2024, 2023]);
    expect(availableSeasons(data)).not.toContain(2026);
  });

  it('drops unsupported years from available seasons', () => {
    const data = {
      targetSeasons: [2025, 2010],
      teams: [{ seasons: { 2018: {} } }],
    };

    expect(availableSeasons(data)).toEqual([2025]);
    expect(isSupportedSeason(2010)).toBe(false);
  });

  it('lists filter options as available plus current, hiding unsupported', () => {
    const data = {
      targetSeasons: [2025],
      teams: [{ seasons: { 2024: {} } }],
    };

    expect(seasonFilterOptions(data)).toEqual([2026, 2025, 2024]);
    expect(seasonOptions(data)).toEqual([2026, 2025, 2024]);
  });

  it('picks last available season from team data before targets', () => {
    const data = {
      targetSeasons: [2026, 2025],
      teams: [{ seasons: { 2024: {}, 2025: {} } }],
    };

    expect(lastAvailableSeason(data)).toBe(2025);
  });

  it('falls back to CURRENT_SEASON when no available seasons exist', () => {
    expect(lastAvailableSeason({ targetSeasons: [], teams: [] })).toBe(CURRENT_SEASON);
  });
});
