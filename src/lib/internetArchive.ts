/**
 * Small Internet Archive / Wayback parsing helpers for research fixtures (#25).
 * Not used by pull:data or scheduled refresh.
 */
import {
  type ArchiveCaptureProvenance,
  type WaybackAvailabilityResponse,
  type WaybackCdxCapture,
  parseArchiveCaptureProvenance,
  parseWaybackAvailabilityResponse,
} from '../data/internetArchiveSchema';

export const INTERNET_ARCHIVE_USER_AGENT =
  'FTC-Team-Analysis-Research/0.1 (+https://github.com/The-Allsparks/ftc-team-analysis; issue-25)';

export function waybackPlaybackUrl(timestamp: string, originalUrl: string): string {
  return `https://web.archive.org/web/${timestamp}/${originalUrl}`;
}

/**
 * Map Availability API `closest` into proposed archive provenance.
 * Always labels `factCurrency: archived` — never current.
 */
export function provenanceFromAvailability(
  response: WaybackAvailabilityResponse,
  archivedAt: string | null,
  originalLiveness: ArchiveCaptureProvenance['originalLiveness'] = 'unknown',
): ArchiveCaptureProvenance | null {
  const closest = response.archived_snapshots.closest;
  if (!closest?.available || !closest.timestamp || !closest.url) {
    return null;
  }

  const candidate: ArchiveCaptureProvenance = {
    originalUrl: response.url,
    archiveUrl: closest.url,
    captureTimestamp: closest.timestamp,
    archivedAt,
    sourceType: 'internet-archive-availability',
    httpStatus: closest.status,
    mimeType: null,
    originalLiveness,
    factCurrency: 'archived',
  };

  const parsed = parseArchiveCaptureProvenance(candidate);
  return parsed.ok ? parsed.data : null;
}

/**
 * Parse CDX `output=json` body: first row headers, following rows values.
 * Accepts a subset of fields; requires at least timestamp + original.
 */
export function parseCdxJsonCaptures(raw: unknown): WaybackCdxCapture[] {
  if (!Array.isArray(raw) || raw.length < 2) {
    return [];
  }

  const headerRow = raw[0];
  if (!Array.isArray(headerRow) || !headerRow.every((cell) => typeof cell === 'string')) {
    return [];
  }

  const headers = headerRow as string[];
  const timestampIdx = headers.indexOf('timestamp');
  const originalIdx = headers.indexOf('original');
  if (timestampIdx < 0 || originalIdx < 0) {
    return [];
  }

  const statusIdx = headers.indexOf('statuscode');
  const mimeIdx = headers.indexOf('mimetype');
  const captures: WaybackCdxCapture[] = [];

  for (const row of raw.slice(1)) {
    if (!Array.isArray(row)) {
      continue;
    }
    const timestamp = row[timestampIdx];
    const original = row[originalIdx];
    if (typeof timestamp !== 'string' || typeof original !== 'string') {
      continue;
    }
    captures.push({
      timestamp,
      original,
      statuscode: statusIdx >= 0 && typeof row[statusIdx] === 'string' ? row[statusIdx] : undefined,
      mimetype: mimeIdx >= 0 && typeof row[mimeIdx] === 'string' ? row[mimeIdx] : undefined,
    });
  }

  return captures;
}

export function provenanceFromCdxCapture(
  capture: WaybackCdxCapture,
  archivedAt: string | null,
  originalLiveness: ArchiveCaptureProvenance['originalLiveness'] = 'unknown',
): ArchiveCaptureProvenance | null {
  const candidate: ArchiveCaptureProvenance = {
    originalUrl: capture.original,
    archiveUrl: waybackPlaybackUrl(capture.timestamp, capture.original),
    captureTimestamp: capture.timestamp,
    archivedAt,
    sourceType: 'internet-archive-cdx',
    httpStatus: capture.statuscode ?? null,
    mimeType: capture.mimetype ?? null,
    originalLiveness,
    factCurrency: 'archived',
  };

  const parsed = parseArchiveCaptureProvenance(candidate);
  return parsed.ok ? parsed.data : null;
}

export { parseArchiveCaptureProvenance, parseWaybackAvailabilityResponse };
