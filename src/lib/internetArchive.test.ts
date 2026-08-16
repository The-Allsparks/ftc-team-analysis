import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  parseArchiveCaptureProvenance,
  parseWaybackAvailabilityResponse,
} from '../data/internetArchiveSchema';
import {
  parseCdxJsonCaptures,
  provenanceFromAvailability,
  provenanceFromCdxCapture,
  waybackPlaybackUrl,
} from './internetArchive';

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'internet-archive-sample.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  availability: unknown;
  availabilityEmpty: unknown;
  cdx: unknown;
  proposedProvenance: unknown;
};

describe('internetArchive research stubs', () => {
  it('parses synthetic Availability JSON and maps archived provenance', () => {
    const parsed = parseWaybackAvailabilityResponse(fixture.availability);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const provenance = provenanceFromAvailability(
      parsed.data,
      '2026-08-16T18:00:00.000Z',
      'alive',
    );
    expect(provenance).toMatchObject({
      factCurrency: 'archived',
      sourceType: 'internet-archive-availability',
      captureTimestamp: '20201101133314',
      originalLiveness: 'alive',
    });
    expect(provenance?.archiveUrl).toContain('web.archive.org/web/20201101133314');
  });

  it('returns null provenance when Availability has no closest snapshot', () => {
    const parsed = parseWaybackAvailabilityResponse(fixture.availabilityEmpty);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(provenanceFromAvailability(parsed.data, null)).toBeNull();
  });

  it('parses synthetic CDX JSON rows into capture + archived provenance', () => {
    const captures = parseCdxJsonCaptures(fixture.cdx);
    expect(captures).toHaveLength(3);
    expect(captures[1]).toMatchObject({
      timestamp: '20201101133314',
      original: 'https://example-nv-ftc-16091.example/',
      statuscode: '200',
    });

    const provenance = provenanceFromCdxCapture(captures[1]!, '2026-08-16T18:00:00.000Z', 'dead');
    expect(provenance).toMatchObject({
      factCurrency: 'archived',
      sourceType: 'internet-archive-cdx',
      originalLiveness: 'dead',
      httpStatus: '200',
    });
    expect(provenance?.archiveUrl).toBe(
      waybackPlaybackUrl('20201101133314', 'https://example-nv-ftc-16091.example/'),
    );
  });

  it('validates proposed ArchiveCaptureProvenance with Valibot', () => {
    const parsed = parseArchiveCaptureProvenance(fixture.proposedProvenance);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.data.factCurrency).toBe('archived');
  });

  it('rejects provenance that claims current currency without required fields', () => {
    const parsed = parseArchiveCaptureProvenance({
      originalUrl: 'https://example.example/',
      archiveUrl: 'https://web.archive.org/web/20200101000000/https://example.example/',
      captureTimestamp: '20200101000000',
      archivedAt: null,
      sourceType: 'internet-archive-cdx',
      factCurrency: 'not-a-currency',
    });
    expect(parsed.ok).toBe(false);
  });
});
