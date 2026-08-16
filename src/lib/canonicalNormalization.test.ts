import { describe, expect, it } from 'vitest';
import {
  casefold,
  collapseWhitespace,
  normalizeCountryCode,
  normalizeOrganizationName,
  normalizeStateCode,
  parseLocationString,
  slugifyOrganizationName,
} from './canonicalNormalization';

describe('canonicalNormalization', () => {
  it('collapses whitespace and casefolds stably', () => {
    expect(collapseWhitespace('  Helen   C   Cannon  ')).toBe('Helen C Cannon');
    expect(casefold('Helen C Cannon')).toBe('helen c cannon');
    expect(normalizeOrganizationName('  Helen C. Cannon Middle School  ')).toBe(
      'helen c cannon middle school',
    );
  });

  it('strips common legal suffixes from organization names', () => {
    expect(normalizeOrganizationName('Acme Robotics, Inc.')).toBe('acme robotics');
    expect(normalizeOrganizationName('Widgets LLC')).toBe('widgets');
    expect(normalizeOrganizationName('Partners L.L.C.')).toBe('partners');
    expect(slugifyOrganizationName('Acme Robotics, Inc.')).toBe('acme-robotics');
  });

  it('parses city/state/country location strings without geocoding', () => {
    expect(parseLocationString('Las Vegas, NV, USA')).toEqual({
      city: 'Las Vegas',
      stateCode: 'NV',
      countryCode: 'US',
      subdivisionCode: 'US-NV',
      normalizedName: 'las vegas, nv, usa',
    });
    expect(parseLocationString('Reno, Nevada')).toMatchObject({
      city: 'Reno',
      stateCode: 'NV',
      countryCode: 'US',
      subdivisionCode: 'US-NV',
    });
    expect(normalizeCountryCode('United States')).toBe('US');
    expect(normalizeStateCode('california')).toBe('CA');
  });

  it('fail-soft on unknown location tokens (no invented codes)', () => {
    expect(parseLocationString('Somewhere, ZZ, Mars')).toMatchObject({
      city: 'Somewhere',
      stateCode: null,
      countryCode: null,
      subdivisionCode: null,
    });
    expect(normalizeStateCode('Atlantis')).toBeNull();
    expect(normalizeCountryCode('Narnia')).toBeNull();
  });
});
