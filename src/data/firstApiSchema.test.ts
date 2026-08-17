import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FIRST_API_TEAMS_PAGE_NOT_OBJECT,
  parseFirstApiTeamsPage,
} from './firstApiSchema';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../lib/fixtures');
const sample = JSON.parse(
  readFileSync(join(fixtureDir, 'first-api-sample.json'), 'utf8'),
) as { teamsPage: unknown };

describe('parseFirstApiTeamsPage', () => {
  it('accepts the synthetic teams listing fixture', () => {
    const parsed = parseFirstApiTeamsPage(sample.teamsPage);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.data.teams).toHaveLength(2);
    expect(parsed.data.teams?.[0]).toMatchObject({
      teamNumber: 16158,
      nameShort: 'Fixture Allsparks',
      schoolName: 'Synthetic High School',
    });
    expect(parsed.quarantinedRecordCount).toBe(0);
  });

  it('quarantines invalid team rows and keeps valid ones', () => {
    const parsed = parseFirstApiTeamsPage({
      teams: [{ teamNumber: 16158, nameShort: 'Ok' }, { nameShort: 'Missing number' }],
      pageTotal: 1,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.data.teams).toHaveLength(1);
    expect(parsed.quarantinedRecordCount).toBe(1);
  });

  it('fails closed on a non-object envelope', () => {
    const parsed = parseFirstApiTeamsPage([]);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.issues[0]?.message).toBe(FIRST_API_TEAMS_PAGE_NOT_OBJECT);
    }
  });
});
