import { describe, expect, it } from 'vitest';
import {
  affiliationsForSeason,
  parseOrganizationAffiliations,
  schoolAffiliations,
  sponsorAffiliations,
} from './organizationAffiliations';

const SEASON = 2025 as const;

describe('parseOrganizationAffiliations', () => {
  it('keeps raw sourceText and splits sponsors from school on &', () => {
    const org = 'Tesla&Helen C Cannon Middle School';
    const rows = parseOrganizationAffiliations(org, { season: SEASON, source: 'ftc-events-sponsors' });

    expect(rows.every((row) => row.sourceText === org)).toBe(true);
    expect(sponsorAffiliations({ season: SEASON, organization: org, affiliations: rows }).map((r) => r.name)).toEqual([
      'Tesla',
    ]);
    expect(schoolAffiliations({ season: SEASON, organization: org, affiliations: rows })).toEqual([
      expect.objectContaining({ entityType: 'school', name: 'Helen C Cannon Middle School', confidence: 'high' }),
    ]);
  });

  it('splits slash-delimited sponsors and spaced ampersand host', () => {
    const org = 'Tesla / Greater Nevada Credit Union & Carson High School';
    const rows = parseOrganizationAffiliations(org, { season: SEASON });

    expect(rows.filter((r) => r.entityType === 'sponsor').map((r) => r.name)).toEqual([
      'Tesla',
      'Greater Nevada Credit Union',
    ]);
    expect(rows.filter((r) => r.entityType === 'school').map((r) => r.name)).toEqual(['Carson High School']);
  });

  it('handles leading ampersand school-only lines', () => {
    const org = '&The Meadows School';
    const rows = parseOrganizationAffiliations(org, { season: SEASON });

    expect(rows.filter((r) => r.entityType === 'sponsor')).toHaveLength(0);
    expect(rows).toEqual([
      expect.objectContaining({ entityType: 'school', name: 'The Meadows School', sourceText: org }),
    ]);
  });

  it('classifies school-only strings without delimiters', () => {
    const org = 'Galena High School';
    const rows = parseOrganizationAffiliations(org, { season: SEASON });
    expect(rows).toEqual([expect.objectContaining({ entityType: 'school', name: org, confidence: 'high' })]);
  });

  it('maps Family/Community and Home School to team_affiliation', () => {
    expect(
      parseOrganizationAffiliations('Tesla & Family/Community', { season: SEASON }).find(
        (r) => r.entityType !== 'sponsor',
      ),
    ).toMatchObject({ entityType: 'team_affiliation', name: 'Family/Community' });

    expect(
      parseOrganizationAffiliations('REV Robotics&Home School', { season: SEASON }).find(
        (r) => r.entityType !== 'sponsor',
      ),
    ).toMatchObject({ entityType: 'team_affiliation', name: 'Home School' });

    expect(parseOrganizationAffiliations('Family/Community', { season: SEASON })).toEqual([
      expect.objectContaining({ entityType: 'team_affiliation', name: 'Family/Community' }),
    ]);
  });

  it('maps 4-H and Boys & Girls Clubs hosts to community_organization', () => {
    const fourH = parseOrganizationAffiliations('Tesla&4-H Youth Development Organization', { season: SEASON });
    expect(fourH.find((r) => r.entityType !== 'sponsor')).toMatchObject({
      entityType: 'community_organization',
      name: '4-H Youth Development Organization',
    });

    const bg = parseOrganizationAffiliations(
      'Tesla & Boys & Girls Clubs of America',
      { season: SEASON },
    );
    expect(bg.find((r) => r.entityType !== 'sponsor')).toMatchObject({
      entityType: 'community_organization',
      name: 'Boys & Girls Clubs of America',
    });
  });

  it('does not split protected ampersands inside names', () => {
    const org = 'Tesla&Mario C & Joanne Monaco MS';
    const rows = parseOrganizationAffiliations(org, { season: SEASON });
    expect(rows.filter((r) => r.entityType === 'sponsor').map((r) => r.name)).toEqual(['Tesla']);
    expect(rows.find((r) => r.entityType !== 'sponsor')?.name).toBe('Mario C & Joanne Monaco MS');
  });

  it('marks multi-host remnants as low confidence', () => {
    const org = 'REV Robotics&4-H&Family/Community';
    const rows = parseOrganizationAffiliations(org, { season: SEASON });
    const hosts = rows.filter((r) => r.entityType !== 'sponsor');
    expect(hosts).toHaveLength(2);
    expect(hosts.every((r) => r.confidence === 'low')).toBe(true);
    expect(hosts.every((r) => r.confirmationState === 'unconfirmed')).toBe(true);
  });

  it('allows the same school name as both sponsor and host', () => {
    const org =
      'Word of Life Christian Academy/Switch/Tesla&Word of Life Christian Academy';
    const rows = parseOrganizationAffiliations(org, { season: SEASON });
    expect(rows.filter((r) => r.entityType === 'sponsor').map((r) => r.name)).toContain(
      'Word of Life Christian Academy',
    );
    expect(rows.filter((r) => r.entityType === 'school').map((r) => r.name)).toEqual([
      'Word of Life Christian Academy',
    ]);
  });

  it('never drops original unmodified source text', () => {
    const org = '  Tesla&Helen C Cannon Middle School  ';
    const rows = parseOrganizationAffiliations(org, { season: SEASON });
    expect(rows[0]?.sourceText).toBe(org.trim());
  });

  it('affiliationsForSeason derives when stored affiliations are missing', () => {
    const season = {
      season: SEASON,
      organization: 'Tesla&Desert Pines High School' as string | null,
    };
    expect(affiliationsForSeason(season).map((r) => r.entityType)).toEqual(['sponsor', 'school']);
  });
});
