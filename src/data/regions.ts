import catalog from './regions.generated.json';

export type RegionGroup = 'us' | 'us-sub' | 'canada' | 'international';

export type FtcRegion = {
  code: string;
  label: string;
  stateProv?: string;
  group: RegionGroup;
};

export const DEFAULT_REGION_CODE = 'USNV';

export const FTC_REGIONS = catalog.regions as FtcRegion[];

export const FTC_REGION_GROUP_LABELS: Record<RegionGroup, string> = {
  us: 'United States',
  'us-sub': 'US sub-regions',
  canada: 'Canada',
  international: 'International',
};

export const FTC_REGION_GROUP_ORDER: RegionGroup[] = ['us', 'us-sub', 'canada', 'international'];

const REGION_BY_CODE = new Map(FTC_REGIONS.map((region) => [region.code, region]));

export function getRegionByCode(code: string): FtcRegion | undefined {
  return REGION_BY_CODE.get(code);
}

export function regionLabel(code: string): string {
  return getRegionByCode(code)?.label ?? code;
}

export function regionStateProv(code: string): string | null {
  return getRegionByCode(code)?.stateProv ?? (code.startsWith('US') && code.length === 4 ? code.slice(2) : null);
}

export function groupRegions(regions: FtcRegion[] = FTC_REGIONS): { group: RegionGroup; label: string; regions: FtcRegion[] }[] {
  return FTC_REGION_GROUP_ORDER.map((group) => ({
    group,
    label: FTC_REGION_GROUP_LABELS[group],
    regions: regions.filter((region) => region.group === group),
  })).filter((entry) => entry.regions.length > 0);
}

export function regionChampionshipCode(regionCode: string): string {
  return `${regionCode}CMP`;
}

export function isRegionChampionshipEvent(eventCode: string | null | undefined, regionCode: string): boolean {
  if (!eventCode) {
    return false;
  }

  return eventCode.startsWith(regionChampionshipCode(regionCode));
}

export function loadStoredRegionCode(fallback = DEFAULT_REGION_CODE): string {
  try {
    return localStorage.getItem('ftc-selected-region') ?? fallback;
  } catch {
    return fallback;
  }
}

export function storeRegionCode(regionCode: string): void {
  try {
    localStorage.setItem('ftc-selected-region', regionCode);
  } catch {
    // Ignore storage failures.
  }
}
