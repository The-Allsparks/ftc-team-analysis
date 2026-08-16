import { describe, expect, it } from 'vitest';
import { parsePullArgs } from './pullArgs';

describe('parsePullArgs', () => {
  it('defaults to full mode with enrichment enabled', () => {
    expect(parsePullArgs([])).toEqual({
      mode: 'full',
      skipLinkEnrichment: false,
      dryRun: false,
      candidateFixture: null,
      help: false,
    });
  });

  it('parses mode, skip enrichment, dry-run, and fixture path', () => {
    expect(
      parsePullArgs([
        '--mode=current',
        '--skip-link-enrichment',
        '--dry-run',
        '--candidate-fixture',
        'tmp/candidate.json',
      ]),
    ).toEqual({
      mode: 'current',
      skipLinkEnrichment: true,
      dryRun: true,
      candidateFixture: 'tmp/candidate.json',
      help: false,
    });
  });

  it('rejects unknown flags and invalid modes', () => {
    expect(() => parsePullArgs(['--mode=nope'])).toThrow(/Invalid --mode/);
    expect(() => parsePullArgs(['--wat'])).toThrow(/Unknown pull:data flag/);
  });
});
