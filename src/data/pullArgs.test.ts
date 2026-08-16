import { describe, expect, it } from 'vitest';
import { parsePullArgs } from './pullArgs';

describe('parsePullArgs', () => {
  it('defaults to full mode with website enrichment on and optional enrichments off', () => {
    expect(parsePullArgs([])).toEqual({
      mode: 'full',
      skipLinkEnrichment: false,
      enrichOpenAlliance: false,
      enrichGm0: false,
      enrichGithub: false,
      dryRun: false,
      candidateFixture: null,
      help: false,
    });
  });

  it('parses mode, skip enrichment, Open Alliance, GM0, GitHub, dry-run, and fixture path', () => {
    expect(
      parsePullArgs([
        '--mode=current',
        '--skip-link-enrichment',
        '--enrich-open-alliance',
        '--enrich-gm0',
        '--enrich-github',
        '--dry-run',
        '--candidate-fixture',
        'tmp/candidate.json',
      ]),
    ).toEqual({
      mode: 'current',
      skipLinkEnrichment: true,
      enrichOpenAlliance: true,
      enrichGm0: true,
      enrichGithub: true,
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
