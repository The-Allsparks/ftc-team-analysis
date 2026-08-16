/**
 * Pure string / location normalization helpers for canonical identity (#16).
 * Offline-safe: no network, no invented external IDs.
 */

const LEGAL_SUFFIX_RE =
  /\b(incorporated|inc|llc|l\.l\.c|ltd|l\.t\.d|co|corp|corporation|company|plc|lp|llp)\.?$/i;

/** USPS state/territory abbreviation → ISO 3166-2 (US-XX). */
export const US_STATE_TO_ISO3166_2: Readonly<Record<string, string>> = {
  AL: 'US-AL',
  AK: 'US-AK',
  AZ: 'US-AZ',
  AR: 'US-AR',
  CA: 'US-CA',
  CO: 'US-CO',
  CT: 'US-CT',
  DE: 'US-DE',
  DC: 'US-DC',
  FL: 'US-FL',
  GA: 'US-GA',
  HI: 'US-HI',
  ID: 'US-ID',
  IL: 'US-IL',
  IN: 'US-IN',
  IA: 'US-IA',
  KS: 'US-KS',
  KY: 'US-KY',
  LA: 'US-LA',
  ME: 'US-ME',
  MD: 'US-MD',
  MA: 'US-MA',
  MI: 'US-MI',
  MN: 'US-MN',
  MS: 'US-MS',
  MO: 'US-MO',
  MT: 'US-MT',
  NE: 'US-NE',
  NV: 'US-NV',
  NH: 'US-NH',
  NJ: 'US-NJ',
  NM: 'US-NM',
  NY: 'US-NY',
  NC: 'US-NC',
  ND: 'US-ND',
  OH: 'US-OH',
  OK: 'US-OK',
  OR: 'US-OR',
  PA: 'US-PA',
  RI: 'US-RI',
  SC: 'US-SC',
  SD: 'US-SD',
  TN: 'US-TN',
  TX: 'US-TX',
  UT: 'US-UT',
  VT: 'US-VT',
  VA: 'US-VA',
  WA: 'US-WA',
  WV: 'US-WV',
  WI: 'US-WI',
  WY: 'US-WY',
  PR: 'US-PR',
  GU: 'US-GU',
  VI: 'US-VI',
  AS: 'US-AS',
  MP: 'US-MP',
};

const STATE_NAME_TO_CODE: Readonly<Record<string, string>> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  'district of columbia': 'DC',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  'puerto rico': 'PR',
};

/** Trim, Unicode casefold, collapse internal whitespace. */
export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function casefold(value: string): string {
  return value.toLocaleLowerCase('en-US');
}

/** Stable compare / catalog key for organization and school names. */
export function normalizeOrganizationName(value: string | null | undefined): string {
  if (value == null) {
    return '';
  }
  let next = collapseWhitespace(casefold(value));
  next = next.replace(/[.'']/g, '');
  next = next.replace(/&/g, ' and ');
  next = collapseWhitespace(next);
  // Strip trailing legal suffixes repeatedly (e.g. "Acme Robotics, Inc.")
  for (let i = 0; i < 3; i += 1) {
    const stripped = next.replace(/,?\s+/g, ' ').replace(LEGAL_SUFFIX_RE, '').trim();
    const cleaned = stripped.replace(/[,\s]+$/g, '').trim();
    if (cleaned === next) {
      break;
    }
    next = cleaned;
  }
  return next;
}

/** URL/node-safe slug from a display name. */
export function slugifyOrganizationName(value: string | null | undefined): string {
  const normalized = normalizeOrganizationName(value);
  return (
    normalized
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'unnamed'
  );
}

export function normalizeCountryCode(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const raw = collapseWhitespace(casefold(value));
  if (!raw) {
    return null;
  }
  if (raw === 'us' || raw === 'usa' || raw === 'u.s.' || raw === 'u.s.a.' || raw === 'united states' || raw === 'united states of america') {
    return 'US';
  }
  if (/^[a-z]{2}$/.test(raw)) {
    return raw.toUpperCase();
  }
  return null;
}

export function normalizeStateCode(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const raw = collapseWhitespace(casefold(value));
  if (!raw) {
    return null;
  }
  if (/^[a-z]{2}$/.test(raw)) {
    const upper = raw.toUpperCase();
    return US_STATE_TO_ISO3166_2[upper] ? upper : null;
  }
  return STATE_NAME_TO_CODE[raw] ?? null;
}

export type ParsedLocationParts = {
  city: string | null;
  stateCode: string | null;
  countryCode: string | null;
  subdivisionCode: string | null;
  normalizedName: string;
};

/**
 * Parse common FTC location strings such as "Las Vegas, NV, USA" without geocoding.
 * Fail-soft: unknown tokens leave fields null rather than inventing codes.
 */
export function parseLocationString(location: string | null | undefined): ParsedLocationParts {
  const raw = collapseWhitespace(location ?? '');
  if (!raw) {
    return {
      city: null,
      stateCode: null,
      countryCode: null,
      subdivisionCode: null,
      normalizedName: '',
    };
  }

  const parts = raw.split(',').map((part) => collapseWhitespace(part)).filter(Boolean);
  let city: string | null = null;
  let stateCode: string | null = null;
  let countryCode: string | null = null;

  if (parts.length === 1) {
    stateCode = normalizeStateCode(parts[0]!) ?? null;
    countryCode = stateCode ? 'US' : normalizeCountryCode(parts[0]!);
    if (!stateCode && !countryCode) {
      city = parts[0]!;
    }
  } else if (parts.length === 2) {
    city = parts[0]!;
    stateCode = normalizeStateCode(parts[1]!) ?? null;
    countryCode = stateCode ? 'US' : normalizeCountryCode(parts[1]!);
  } else {
    city = parts[0]!;
    stateCode = normalizeStateCode(parts[1]!) ?? null;
    countryCode = normalizeCountryCode(parts[parts.length - 1]!) ?? (stateCode ? 'US' : null);
    if (!stateCode && parts.length >= 3) {
      stateCode = normalizeStateCode(parts[parts.length - 2]!) ?? null;
      if (stateCode && !countryCode) {
        countryCode = 'US';
      }
    }
  }

  const subdivisionCode =
    countryCode === 'US' && stateCode && US_STATE_TO_ISO3166_2[stateCode]
      ? US_STATE_TO_ISO3166_2[stateCode]!
      : null;

  const normalizedName = collapseWhitespace(casefold(raw));

  return { city, stateCode, countryCode, subdivisionCode, normalizedName };
}
