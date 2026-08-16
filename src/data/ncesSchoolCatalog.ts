/**
 * Curated NCES school / district allowlist for confident identity matches (#16).
 *
 * Entries are hand-verified against public NCES CCD / PSS pages.
 * Do not invent IDs. Ambiguous names belong in AMBIGUOUS_SCHOOL_KEYS (quarantine).
 */
import type { AffiliationConfidence } from './schema';

export type NcesCatalogEntry = {
  /** Keys from `normalizeOrganizationName` that uniquely identify this school. */
  matchKeys: string[];
  /** USPS state codes that apply; empty means any (use only for unique names). */
  stateCodes: string[];
  displayName: string;
  /** Alternate public names (also keyed via normalizeOrganizationName). */
  aliases?: string[];
  /** NCES CCD school ID (NCESSCH) for public schools. */
  ncesSch?: string;
  /** NCES CCD LEA / district ID. */
  ncesLea?: string;
  /** NCES Private School Universe Survey ID. */
  ncesPss?: string;
  evidenceUrl: string;
  confidence: AffiliationConfidence;
};

/**
 * Golden Nevada fixtures with verified public NCES identifiers.
 * Evidence links point at NCES or ProPublica PSS-backed pages.
 */
export const NCES_SCHOOL_CATALOG: readonly NcesCatalogEntry[] = [
  {
    matchKeys: ['helen c cannon middle school', 'cannon helen c jhs', 'helen c cannon jhs'],
    stateCodes: ['NV'],
    displayName: 'Helen C Cannon Middle School',
    aliases: ['Cannon Helen C JHS', 'Helen C. Cannon Middle School'],
    ncesSch: '320006000042',
    ncesLea: '3200060',
    evidenceUrl: 'https://nces.ed.gov/ccd/schoolsearch/school_detail.asp?ID=320006000042',
    confidence: 'high',
  },
  {
    matchKeys: ['galena high school'],
    stateCodes: ['NV'],
    displayName: 'Galena High School',
    ncesSch: '320048000257',
    ncesLea: '3200480',
    evidenceUrl: 'https://nces.ed.gov/ccd/schoolsearch/school_detail.asp?ID=320048000257',
    confidence: 'high',
  },
  {
    matchKeys: ['the meadows school', 'meadows school'],
    stateCodes: ['NV'],
    displayName: 'The Meadows School',
    ncesPss: '02117913',
    evidenceUrl: 'https://projects.propublica.org/private-school-demographics/schools/the-meadows-school-02117913/',
    confidence: 'high',
  },
];

/**
 * Normalized keys that are known-ambiguous without stronger disambiguation.
 * Matching these yields quarantine — no external ID is assigned.
 */
export const AMBIGUOUS_SCHOOL_KEYS: ReadonlySet<string> = new Set([
  'lincoln high school',
  'washington high school',
  'central high school',
  'high school',
  'middle school',
  'elementary school',
]);
