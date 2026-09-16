export type SourceCatalogEntry = {
  id: string;
  label: string;
  /** Public origin used for Google s2 favicons. */
  faviconOrigin: string;
  homepage: string;
};

export const FIELD_AGREEMENT_SOURCES: readonly SourceCatalogEntry[] = [
  {
    id: 'ftc-events',
    label: 'FTC Events',
    faviconOrigin: 'https://ftc-events.firstinspires.org',
    homepage: 'https://ftc-events.firstinspires.org/',
  },
  {
    id: 'first-api',
    label: 'FIRST API',
    faviconOrigin: 'https://ftc-api.firstinspires.org',
    homepage: 'https://ftc-events.firstinspires.org/services/API',
  },
  {
    id: 'ftcscout',
    label: 'FTCScout',
    faviconOrigin: 'https://ftcscout.org',
    homepage: 'https://ftcscout.org/',
  },
  {
    id: 'portfolio-lab',
    label: 'Portfolio Lab',
    faviconOrigin: 'https://www.ftcportfoliolab.org',
    homepage: 'https://www.ftcportfoliolab.org/',
  },
  {
    id: 'open-alliance',
    label: 'Open Alliance',
    faviconOrigin: 'https://www.theopenalliance.org',
    homepage: 'https://www.theopenalliance.org/',
  },
  {
    id: 'gm0',
    label: 'Game Manual 0',
    faviconOrigin: 'https://gm0.org',
    homepage: 'https://gm0.org/',
  },
  {
    id: 'nces',
    label: 'NCES',
    faviconOrigin: 'https://nces.ed.gov',
    homepage: 'https://nces.ed.gov/ccd/',
  },
];

const SOURCE_ALIASES: Record<string, string> = {
  'ftc-events-team-page': 'ftc-events',
  'ftc events': 'ftc-events',
  'first-search': 'ftc-events',
  'first-api': 'first-api',
  'first api': 'first-api',
  'ftc events api': 'first-api',
  'ftc events api (authenticated)': 'first-api',
  ftcscout: 'ftcscout',
  'portfolio lab': 'portfolio-lab',
  'open alliance': 'open-alliance',
  'open alliance (team-declared)': 'open-alliance',
  gm0: 'gm0',
  'game manual 0': 'gm0',
  'game manual 0 (gallery)': 'gm0',
  derived: 'ftc-events',
  'organization-parse': 'ftc-events',
  'organization-backfill': 'ftc-events',
  'offline-synthesize': 'ftc-events',
  'refresh-presence': 'ftc-events',
  'nces-catalog': 'nces',
  'nces-ccd-catalog': 'nces',
  'nces-pss-catalog': 'nces',
};

function normalizeSourceKey(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function catalogSourceId(sourceType: string): string {
  const key = normalizeSourceKey(sourceType);
  return SOURCE_ALIASES[key] ?? key.replace(/[^a-z0-9]+/g, '-');
}

export function sourceCatalogEntry(sourceType: string): SourceCatalogEntry | null {
  const id = catalogSourceId(sourceType);
  return FIELD_AGREEMENT_SOURCES.find((entry) => entry.id === id) ?? null;
}
