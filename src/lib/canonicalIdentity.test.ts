import { describe, expect, it } from 'vitest';
import type { NcesCatalogEntry } from '../data/ncesSchoolCatalog';
import type { TeamAffiliation, TeamSeason } from '../data/schema';
import { parseGeneratedSeed } from '../data/generatedSeedSchema';
import {
  affiliationsWithCanonicalIdentity,
  buildRegisteredLocation,
  enrichAffiliationIdentity,
  enrichSeasonCanonicalIdentity,
  isCrossStateRegionParticipant,
  matchSchoolIdentity,
} from './canonicalIdentity';

const SEASON = 2025 as const;

function schoolAffiliation(name: string): TeamAffiliation {
  return {
    entityType: 'school',
    name,
    season: SEASON,
    source: 'organization-backfill',
    retrievedAt: null,
    confidence: 'high',
    confirmationState: 'unconfirmed',
    sourceText: name,
  };
}

function baseSeason(overrides: Partial<TeamSeason> = {}): TeamSeason {
  return {
    season: SEASON,
    active: true,
    name: 'Fixture Bots',
    location: 'Las Vegas, NV, USA',
    city: 'Las Vegas',
    state: 'NV',
    country: 'USA',
    region: 'Nevada',
    league: null,
    rookieYear: 2020,
    organization: 'Helen C Cannon Middle School',
    teamType: 'school',
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
    ...overrides,
  };
}

describe('canonicalIdentity', () => {
  it('golden: Helen C Cannon Middle School maps to verified NCES IDs', () => {
    const match = matchSchoolIdentity('Helen C Cannon Middle School', { stateCode: 'NV' });
    expect(match.status).toBe('matched');
    expect(match.identifiers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ idNamespace: 'nces-sch', canonicalId: '320006000042' }),
        expect.objectContaining({ idNamespace: 'nces-lea', canonicalId: '3200060' }),
      ]),
    );
    expect(match.identifiers.every((row) => row.evidence)).toBe(true);

    const enriched = enrichAffiliationIdentity(schoolAffiliation('Helen C. Cannon Middle School'), {
      stateCode: 'NV',
    });
    expect(enriched.identityMatchStatus).toBe('matched');
    expect(enriched.normalizedName).toBe('helen c cannon middle school');
    expect(enriched.slug).toBe('helen-c-cannon-middle-school');
    expect(enriched.identifiers?.some((row) => row.idNamespace === 'nces-sch')).toBe(true);
  });

  it('golden: Galena High School and The Meadows School match catalog IDs', () => {
    expect(matchSchoolIdentity('Galena High School', { stateCode: 'NV' })).toMatchObject({
      status: 'matched',
      identifiers: expect.arrayContaining([
        expect.objectContaining({ idNamespace: 'nces-sch', canonicalId: '320048000257' }),
      ]),
    });
    expect(matchSchoolIdentity('The Meadows School', { stateCode: 'NV' })).toMatchObject({
      status: 'matched',
      identifiers: expect.arrayContaining([
        expect.objectContaining({ idNamespace: 'nces-pss', canonicalId: '02117913' }),
      ]),
    });
  });

  it('does not invent external IDs for unknown schools', () => {
    const match = matchSchoolIdentity('Completely Fictional Robotics Academy', { stateCode: 'NV' });
    expect(match.status).toBe('unmatched');
    expect(match.identifiers).toEqual([]);

    const enriched = enrichAffiliationIdentity(
      schoolAffiliation('Completely Fictional Robotics Academy'),
      { stateCode: 'NV' },
    );
    expect(enriched.identityMatchStatus).toBe('unmatched');
    expect(enriched.identifiers).toEqual([
      expect.objectContaining({ idNamespace: 'internal-slug' }),
    ]);
    expect(enriched.identifiers?.some((row) => row.idNamespace.startsWith('nces-'))).toBe(false);
  });

  it('quarantines ambiguous NCES / common school names without assigning external IDs', () => {
    const match = matchSchoolIdentity('Lincoln High School', { stateCode: 'NV' });
    expect(match.status).toBe('quarantined');
    expect(match.identifiers).toEqual([]);

    const multiCatalog: NcesCatalogEntry[] = [
      {
        matchKeys: ['springfield high school'],
        stateCodes: ['NV'],
        displayName: 'Springfield High School (NV)',
        ncesSch: '320000000001',
        evidenceUrl: 'https://example.test/nv',
        confidence: 'medium',
      },
      {
        matchKeys: ['springfield high school'],
        stateCodes: ['CA'],
        displayName: 'Springfield High School (CA)',
        ncesSch: '060000000001',
        evidenceUrl: 'https://example.test/ca',
        confidence: 'medium',
      },
    ];
    // No state hint → both NV and CA entries match → ambiguous quarantine path
    const ambiguous = matchSchoolIdentity('Springfield High School', { catalog: multiCatalog });
    expect(ambiguous.status).toBe('ambiguous');
    expect(ambiguous.identifiers).toEqual([]);
  });

  it('distinguishes registered postal location from event-region membership', () => {
    const season = baseSeason({
      location: 'Bishop, CA, USA',
      city: 'Bishop',
      state: 'CA',
      country: 'USA',
      region: 'Nevada',
      organization: 'Family/Community',
    });
    const enriched = enrichSeasonCanonicalIdentity(season);
    expect(enriched.registeredLocation?.stateCode).toBe('CA');
    expect(enriched.registeredLocation?.subdivisionCode).toBe('US-CA');
    expect(enriched.registeredLocation?.countryCode).toBe('US');
    expect(enriched.region).toBe('Nevada');
    expect(isCrossStateRegionParticipant(enriched, 'USNV')).toBe(true);
    expect(isCrossStateRegionParticipant(baseSeason(), 'USNV')).toBe(false);
  });

  it('builds registeredLocation ISO identifiers from seed strings', () => {
    const location = buildRegisteredLocation(baseSeason());
    expect(location.identifiers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ idNamespace: 'iso-3166-1', canonicalId: 'US' }),
        expect.objectContaining({ idNamespace: 'iso-3166-2', canonicalId: 'US-NV' }),
      ]),
    );
    expect(location.geo).toBeNull();
  });

  it('derive-on-read affiliations include identity fields without mutating input', () => {
    const season = baseSeason({
      affiliations: [schoolAffiliation('Galena High School')],
    });
    const before = structuredClone(season);
    const rows = affiliationsWithCanonicalIdentity(season);
    expect(season).toEqual(before);
    expect(rows[0]?.identityMatchStatus).toBe('matched');
    expect(rows[0]?.identifiers?.some((row) => row.idNamespace === 'nces-sch')).toBe(true);
  });

  it('seed schema accepts optional registeredLocation and affiliation identity fields', () => {
    const season = enrichSeasonCanonicalIdentity(baseSeason());
    const result = parseGeneratedSeed({
      generatedAt: '2026-01-01T00:00:00.000Z',
      targetSeasons: [2025],
      regionCode: 'USNV',
      teams: [
        {
          number: 1,
          latestName: 'Fixture Bots',
          latestLocation: season.location,
          latestCity: season.city,
          latestState: season.state,
          latestCountry: season.country,
          latestRookieYear: 2020,
          latestOrganization: season.organization,
          latestWebsite: null,
          latestTeamType: 'school',
          latestLeague: null,
          latestRegion: 'Nevada',
          links: [],
          seasons: { '2025': season },
        },
      ],
      regionEvents: [],
      sources: [{ label: 'test', url: 'https://example.test', note: 'fixture' }],
      limitations: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.teams[0]?.seasons[2025]?.registeredLocation?.subdivisionCode).toBe('US-NV');
    expect(result.data.teams[0]?.seasons[2025]?.affiliations?.[0]?.identifiers?.length).toBeGreaterThan(
      0,
    );
  });
});
