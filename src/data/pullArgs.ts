export type PullMode = 'current' | 'full';

export type PullArgs = {
  mode: PullMode;
  skipLinkEnrichment: boolean;
  /** Opt-in Open Alliance FTC team-declared resource enrichment (off by default). */
  enrichOpenAlliance: boolean;
  /** Opt-in Game Manual 0 gallery resource enrichment (off by default). */
  enrichGm0: boolean;
  dryRun: boolean;
  /** When set, skip network pull and load this JSON as the candidate (tests / dry gates). */
  candidateFixture: string | null;
  help: boolean;
};

const TRUE_FLAGS = new Set(['1', 'true', 'yes', 'on']);

function readFlagValue(argv: string[], index: number): { value: string; nextIndex: number } {
  const token = argv[index] ?? '';
  const eq = token.indexOf('=');
  if (eq >= 0) {
    return { value: token.slice(eq + 1), nextIndex: index };
  }
  const next = argv[index + 1];
  if (next && !next.startsWith('--')) {
    return { value: next, nextIndex: index + 1 };
  }
  return { value: '', nextIndex: index };
}

function isTruthy(value: string): boolean {
  return TRUE_FLAGS.has(value.trim().toLowerCase());
}

/** Parse `pull:data` CLI flags used by local runs and GitHub Actions. */
export function parsePullArgs(argv: string[]): PullArgs {
  const args: PullArgs = {
    mode: 'full',
    skipLinkEnrichment: false,
    enrichOpenAlliance: false,
    enrichGm0: false,
    dryRun: false,
    candidateFixture: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? '';
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--skip-link-enrichment' || token.startsWith('--skip-link-enrichment=')) {
      if (token.includes('=')) {
        args.skipLinkEnrichment = isTruthy(token.slice(token.indexOf('=') + 1));
      } else {
        args.skipLinkEnrichment = true;
      }
      continue;
    }
    if (token === '--enrich-open-alliance' || token.startsWith('--enrich-open-alliance=')) {
      if (token.includes('=')) {
        args.enrichOpenAlliance = isTruthy(token.slice(token.indexOf('=') + 1));
      } else {
        args.enrichOpenAlliance = true;
      }
      continue;
    }
    if (token === '--enrich-gm0' || token.startsWith('--enrich-gm0=')) {
      if (token.includes('=')) {
        args.enrichGm0 = isTruthy(token.slice(token.indexOf('=') + 1));
      } else {
        args.enrichGm0 = true;
      }
      continue;
    }
    if (token === '--dry-run' || token.startsWith('--dry-run=')) {
      if (token.includes('=')) {
        args.dryRun = isTruthy(token.slice(token.indexOf('=') + 1));
      } else {
        args.dryRun = true;
      }
      continue;
    }
    if (token.startsWith('--mode') || token === '--mode') {
      const { value, nextIndex } = readFlagValue(argv, index);
      index = nextIndex;
      if (value !== 'current' && value !== 'full') {
        throw new Error(`Invalid --mode=${value || '(empty)'}; expected current|full`);
      }
      args.mode = value;
      continue;
    }
    if (token.startsWith('--candidate-fixture') || token === '--candidate-fixture') {
      const { value, nextIndex } = readFlagValue(argv, index);
      index = nextIndex;
      if (!value) {
        throw new Error('--candidate-fixture requires a path');
      }
      args.candidateFixture = value;
      continue;
    }
    if (token.startsWith('-')) {
      throw new Error(`Unknown pull:data flag: ${token}`);
    }
  }

  return args;
}

export const PULL_DATA_HELP = `Usage: npm run pull:data -- [options]

Options:
  --mode=current|full       current = refresh CURRENT_SEASON and merge; full = rebuild all supported (default)
  --skip-link-enrichment    skip crawling team websites for links
  --enrich-open-alliance    opt-in: attach Open Alliance team-declared resources (exact team # only)
  --enrich-gm0              opt-in: attach Game Manual 0 gallery resources (exact team # only)
  --dry-run                 run guards/report but do not write the seed
  --candidate-fixture=PATH  load candidate JSON from PATH (no network); for gate tests
  --help                    show this help
`;
