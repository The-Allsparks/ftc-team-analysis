/**
 * Proposed Internet Archive / Wayback provenance fields (#25).
 *
 * Research-only shapes — not wired into the mega seed or observations side store yet.
 * See docs/internet-archive.md.
 */
import * as v from 'valibot';

export const INTERNET_ARCHIVE_PROVENANCE_SCHEMA_VERSION = 1 as const;

/** Whether a fact describes the live present or an archived capture. */
export const ARCHIVE_FACT_CURRENCIES = ['current', 'archived'] as const;
export type ArchiveFactCurrency = (typeof ARCHIVE_FACT_CURRENCIES)[number];

/**
 * Live original-URL liveness context (orthogonal to whether a Wayback capture exists).
 * Distinct from archived capture availability.
 */
export const ARCHIVE_ORIGINAL_LIVENESS = ['alive', 'dead', 'unknown'] as const;
export type ArchiveOriginalLiveness = (typeof ARCHIVE_ORIGINAL_LIVENESS)[number];

export const ARCHIVE_SOURCE_TYPES = [
  'internet-archive-availability',
  'internet-archive-cdx',
] as const;
export type ArchiveSourceType = (typeof ARCHIVE_SOURCE_TYPES)[number];

/**
 * Provenance for a single Wayback capture used to support an archived observation.
 * `captureTimestamp` is the IA crawl time; `archivedAt` is when we queried IA.
 */
export type ArchiveCaptureProvenance = {
  originalUrl: string;
  /** Playback URL, e.g. https://web.archive.org/web/{timestamp}/{original} */
  archiveUrl: string;
  /** CDX / Availability timestamp (14-digit yyyyMMddHHmmss) or ISO-8601. */
  captureTimestamp: string;
  /** ISO-8601 when this project retrieved archive metadata. */
  archivedAt: string | null;
  sourceType: ArchiveSourceType;
  httpStatus?: string | null;
  mimeType?: string | null;
  /** Live probe of the original URL, when known — not IA availability. */
  originalLiveness?: ArchiveOriginalLiveness | null;
  /** Explicit archived-vs-current label for UI / observation joins. */
  factCurrency: ArchiveFactCurrency;
};

export type WaybackAvailabilityClosest = {
  status: string;
  available: boolean;
  url: string;
  timestamp: string;
};

export type WaybackAvailabilityResponse = {
  url: string;
  archived_snapshots: {
    closest?: WaybackAvailabilityClosest;
  };
};

/** One CDX row after header mapping (timestamp, original, statuscode, mimetype, …). */
export type WaybackCdxCapture = {
  timestamp: string;
  original: string;
  statuscode?: string;
  mimetype?: string;
};

const archiveFactCurrencySchema = v.picklist(ARCHIVE_FACT_CURRENCIES);
const archiveOriginalLivenessSchema = v.picklist(ARCHIVE_ORIGINAL_LIVENESS);
const archiveSourceTypeSchema = v.picklist(ARCHIVE_SOURCE_TYPES);
const nullableString = v.nullable(v.string());

export const archiveCaptureProvenanceSchema = v.object({
  originalUrl: v.string(),
  archiveUrl: v.string(),
  captureTimestamp: v.string(),
  archivedAt: nullableString,
  sourceType: archiveSourceTypeSchema,
  httpStatus: v.optional(nullableString),
  mimeType: v.optional(nullableString),
  originalLiveness: v.optional(v.nullable(archiveOriginalLivenessSchema)),
  factCurrency: archiveFactCurrencySchema,
});

export const waybackAvailabilityClosestSchema = v.object({
  status: v.string(),
  available: v.boolean(),
  url: v.string(),
  timestamp: v.string(),
});

export const waybackAvailabilityResponseSchema = v.object({
  url: v.string(),
  archived_snapshots: v.object({
    closest: v.optional(waybackAvailabilityClosestSchema),
  }),
});

export function parseArchiveCaptureProvenance(
  raw: unknown,
):
  | { ok: true; data: ArchiveCaptureProvenance }
  | { ok: false; issues: string[] } {
  const parsed = v.safeParse(archiveCaptureProvenanceSchema, raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.issues.map((issue) => issue.message),
    };
  }
  return { ok: true, data: parsed.output };
}

export function parseWaybackAvailabilityResponse(
  raw: unknown,
):
  | { ok: true; data: WaybackAvailabilityResponse }
  | { ok: false; issues: string[] } {
  const parsed = v.safeParse(waybackAvailabilityResponseSchema, raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.issues.map((issue) => issue.message),
    };
  }
  return { ok: true, data: parsed.output };
}
