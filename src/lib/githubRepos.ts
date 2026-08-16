import type {
  CodeRepositoryEvidenceKind,
  LinkConfirmation,
  LinkOwnershipConfidence,
  Team,
  TeamCodeRepository,
  TeamLink,
} from '../data/schema';
import { isGm0LinkSource } from './gm0Gallery';
import { isAllowedPublicTeamLink, normalizeLinkUrl } from './linkDiscovery';
import { isOpenAllianceLinkSource } from './openAlliance';

/** Public GitHub REST (unauthenticated; strict rate limits — prefer verifying known URLs). */
export const GITHUB_API_BASE = 'https://api.github.com';
export const GITHUB_SOURCE = 'GitHub (verified)';
export const GITHUB_USER_AGENT = 'Nevada-FTC-Team-Explorer-github-verification';

export type { CodeRepositoryEvidenceKind };

export type ParsedGithubRepo = {
  owner: string;
  name: string;
  fullName: string;
  url: string;
};

export type GithubRepoMetadata = {
  description: string | null;
  languages: string[];
  lastActivity: string | null;
  defaultBranch: string | null;
  isPrivate: boolean;
  archived: boolean;
};

export type GithubSearchHit = {
  htmlUrl: string;
  fullName: string;
  description?: string | null;
  /** True when the only identity signal is the team number in name/path/description. */
  matchedOnNumberOnly?: boolean;
};

export type GithubCandidate = {
  url: string;
  owner: string;
  name: string;
  fullName: string;
  evidenceKind: CodeRepositoryEvidenceKind;
  source: string;
  evidence: string;
  ownershipConfidence: LinkOwnershipConfidence;
  linkEvidence?: string | null;
  /** Description from search hit or prior knowledge when API metadata is skipped. */
  descriptionHint?: string | null;
};

export type ApplyGithubReposResult = {
  matchedTeams: number;
  reposAdded: number;
  candidatesSeen: number;
  rejectedNumberOnly: number;
  skippedPrivateOrInvalid: number;
};

const NAME_STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'team',
  'ftc',
  'frc',
  'robotics',
  'robot',
  'club',
  'high',
  'school',
  'ms',
  'hs',
  'of',
  'at',
  'a',
  'an',
]);

const CONTROLLER_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bcontrol\s*hubs?\b/i, label: 'REV Control Hub' },
  { pattern: /\brev\s*hub\b/i, label: 'REV Hub' },
  { pattern: /\bexpansion\s*hubs?\b/i, label: 'REV Expansion Hub' },
  { pattern: /\bandroid\s*(phone|device|rc)\b/i, label: 'Android phone RC' },
  { pattern: /\blego\s*mindstorms?\b|\bev3\b/i, label: 'LEGO Mindstorms' },
];

/**
 * Parse a public github.com owner/repo URL. Rejects profiles, gists, settings, and
 * non-repo paths. Does not infer ownership — callers must supply evidence separately.
 */
export function parseGithubRepoUrl(value: string | null | undefined): ParsedGithubRepo | null {
  const normalized = normalizeLinkUrl(value);
  if (!normalized) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  if (host !== 'github.com') {
    return null;
  }

  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length < 2) {
    // Profile-only URLs are not stored as verified repos (privacy: no student account scrape).
    return null;
  }

  const [ownerRaw, nameRaw] = parts;
  const blockedFirst = new Set([
    'settings',
    'marketplace',
    'orgs',
    'organizations',
    'features',
    'topics',
    'collections',
    'events',
    'sponsors',
    'login',
    'join',
    'pricing',
    'about',
    'security',
    'customer-stories',
    'team',
    'enterprise',
    'pulls',
    'issues',
    'notifications',
    'explore',
  ]);

  if (!ownerRaw || !nameRaw || blockedFirst.has(ownerRaw.toLowerCase())) {
    return null;
  }

  if (/^(gist|raw|api)\./i.test(host)) {
    return null;
  }

  const owner = ownerRaw;
  const name = nameRaw.replace(/\.git$/i, '');
  if (!owner || !name || name === 'followers' || name === 'following') {
    return null;
  }

  const fullName = `${owner}/${name}`;
  return {
    owner,
    name,
    fullName,
    url: `https://github.com/${fullName}`,
  };
}

export function isGithubCodeLink(link: Pick<TeamLink, 'type' | 'url'>): boolean {
  if (link.type === 'code') {
    return Boolean(parseGithubRepoUrl(link.url));
  }
  return Boolean(parseGithubRepoUrl(link.url));
}

export function isGithubVerifiedSource(source: string | null | undefined): boolean {
  return Boolean(source && /github\s*\(verified\)/i.test(source));
}

export function githubRepoAttribution(
  repo: Pick<TeamCodeRepository, 'source' | 'evidence' | 'ownershipConfidence'>,
): string {
  const parts = [
    repo.source,
    repo.ownershipConfidence ? `ownership: ${repo.ownershipConfidence}` : null,
    repo.evidence,
  ].filter(Boolean);
  return parts.join(' · ');
}

/** Significant name tokens used for corroboration (never sufficient alone without number + other evidence rules). */
export function teamNameTokens(teamName: string): string[] {
  return teamName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !NAME_STOP_WORDS.has(token));
}

function haystackContainsNameToken(haystack: string, tokens: string[]): boolean {
  const lower = haystack.toLowerCase();
  return tokens.some((token) => lower.includes(token));
}

function haystackContainsTeamNumber(haystack: string, teamNumber: number): boolean {
  return new RegExp(`(^|[^0-9])${teamNumber}([^0-9]|$)`).test(haystack);
}

export function inferRobotControllerType(
  description: string | null | undefined,
  languages: string[] | null | undefined = null,
): string | null {
  const text = `${description ?? ''} ${(languages ?? []).join(' ')}`;
  for (const entry of CONTROLLER_PATTERNS) {
    if (entry.pattern.test(text)) {
      return entry.label;
    }
  }
  return null;
}

export function inferSeasonsFromText(text: string | null | undefined): number[] | null {
  if (!text) {
    return null;
  }
  const years = new Set<number>();
  for (const match of text.matchAll(/\b(201[6-9]|202[0-9]|2030)\b/g)) {
    years.add(Number(match[1]));
  }
  if (years.size === 0) {
    return null;
  }
  return [...years].sort((a, b) => b - a);
}

function evidenceKindFromLink(link: TeamLink): CodeRepositoryEvidenceKind {
  if (isOpenAllianceLinkSource(link.source)) {
    return 'open-alliance';
  }
  if (isGm0LinkSource(link.source)) {
    return 'gm0-gallery';
  }
  return 'declared-link';
}

function confidenceForKind(kind: CodeRepositoryEvidenceKind): LinkOwnershipConfidence {
  if (kind === 'open-alliance' || kind === 'gm0-gallery' || kind === 'declared-link') {
    return 'high';
  }
  return 'medium';
}

function evidenceTextForCandidate(
  teamNumber: number,
  kind: CodeRepositoryEvidenceKind,
  link: TeamLink | null,
  hit: GithubSearchHit | null,
): string {
  if (kind === 'open-alliance') {
    return (
      `GitHub repo declared on Open Alliance for team ${teamNumber}` +
      (link?.evidence ? ` (${link.evidence})` : '') +
      '; ownership not inferred from team number alone.'
    );
  }
  if (kind === 'gm0-gallery') {
    return (
      `GitHub repo listed on Game Manual 0 gallery for team ${teamNumber}` +
      (link?.evidence ? ` (${link.evidence})` : '') +
      '; ownership not inferred from team number alone.'
    );
  }
  if (kind === 'declared-link') {
    return (
      `GitHub repo discovered from team-declared / crawled public links` +
      (link?.source ? ` (source: ${link.source})` : '') +
      (link?.evidence ? `; ${link.evidence}` : '') +
      '; ownership not inferred from team number alone.'
    );
  }
  return (
    `GitHub search hit for team ${teamNumber} corroborated by team-name tokens` +
    (hit?.fullName ? ` in ${hit.fullName}` : '') +
    (hit?.description ? ` / description` : '') +
    '; number-only matches are rejected.'
  );
}

/**
 * Collect GitHub repo candidates already present on the team (website / OA / GM0 links).
 * These are high-trust when declared; verification enriches metadata without claiming number-only ownership.
 */
export function collectGithubCandidatesFromLinks(team: Team): GithubCandidate[] {
  const byUrl = new Map<string, GithubCandidate>();

  for (const link of team.links ?? []) {
    const parsed = parseGithubRepoUrl(link.url);
    if (!parsed) {
      continue;
    }
    if (!isAllowedPublicTeamLink(parsed.url, team)) {
      continue;
    }

    const evidenceKind = evidenceKindFromLink(link);
    const candidate: GithubCandidate = {
      url: parsed.url,
      owner: parsed.owner,
      name: parsed.name,
      fullName: parsed.fullName,
      evidenceKind,
      source: link.source || GITHUB_SOURCE,
      evidence: evidenceTextForCandidate(team.number, evidenceKind, link, null),
      ownershipConfidence: link.ownershipConfidence ?? confidenceForKind(evidenceKind),
      linkEvidence: link.evidence ?? null,
    };

    const existing = byUrl.get(parsed.url);
    if (!existing || confidenceRank(candidate.ownershipConfidence) >= confidenceRank(existing.ownershipConfidence)) {
      byUrl.set(parsed.url, candidate);
    }
  }

  return [...byUrl.values()];
}

function confidenceRank(value: LinkOwnershipConfidence | undefined): number {
  if (value === 'high') return 3;
  if (value === 'medium') return 2;
  if (value === 'low') return 1;
  return 0;
}

/**
 * Ownership gate for optional GitHub search hits.
 * Number-only matches (repo named after the team number with no other corroboration) are rejected.
 */
export function evaluateGithubSearchOwnership(args: {
  teamNumber: number;
  teamName: string;
  hit: GithubSearchHit;
  /** Pre-declared candidate URLs for this team (website / OA / GM0). */
  declaredUrls?: ReadonlySet<string>;
}): { accepted: boolean; reason: string; evidenceKind?: CodeRepositoryEvidenceKind } {
  const parsed = parseGithubRepoUrl(args.hit.htmlUrl) ?? parseGithubRepoUrl(`https://github.com/${args.hit.fullName}`);
  if (!parsed) {
    return { accepted: false, reason: 'not a public github.com owner/repo URL' };
  }

  const normalizedUrl = parsed.url;
  if (args.declaredUrls?.has(normalizedUrl)) {
    return {
      accepted: true,
      reason: 'already declared on team links (website / OA / GM0)',
      evidenceKind: 'declared-link',
    };
  }

  const haystack = `${parsed.fullName} ${args.hit.description ?? ''}`;
  const hasNumber = haystackContainsTeamNumber(haystack, args.teamNumber);
  const tokens = teamNameTokens(args.teamName);
  const hasName = tokens.length > 0 && haystackContainsNameToken(haystack, tokens);

  // Number-only: team number present (or search flagged as number-only) without name corroboration.
  if ((args.hit.matchedOnNumberOnly === true || hasNumber) && !hasName) {
    return {
      accepted: false,
      reason:
        'number-only GitHub match rejected — ownership requires evidence beyond team number alone',
    };
  }

  if (hasNumber && hasName) {
    return {
      accepted: true,
      reason: 'team number plus team-name token corroboration',
      evidenceKind: 'search-corroborated',
    };
  }

  return {
    accepted: false,
    reason: 'insufficient ownership evidence (need declared link or number + name corroboration)',
  };
}

/**
 * Optional unauthenticated GitHub REST metadata fetch. Fail-soft; never throws for HTTP errors.
 * Prefer verifying URLs already discovered — broad search burns the unauthenticated rate limit.
 */
export async function fetchGithubRepoMetadata(
  fullName: string,
  options?: { fetchImpl?: typeof fetch; signal?: AbortSignal },
): Promise<GithubRepoMetadata | null> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const repoUrl = `${GITHUB_API_BASE}/repos/${fullName}`;

  try {
    const response = await fetchImpl(repoUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': GITHUB_USER_AGENT,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: options?.signal,
    });

    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      return null;
    }

    const raw = (await response.json()) as Record<string, unknown>;
    if (raw.private === true) {
      return {
        description: null,
        languages: [],
        lastActivity: null,
        defaultBranch: null,
        isPrivate: true,
        archived: Boolean(raw.archived),
      };
    }

    const languages = await fetchGithubRepoLanguages(fullName, {
      fetchImpl,
      signal: options?.signal,
    });

    return {
      description: typeof raw.description === 'string' ? raw.description : null,
      languages,
      lastActivity: typeof raw.pushed_at === 'string' ? raw.pushed_at : null,
      defaultBranch: typeof raw.default_branch === 'string' ? raw.default_branch : null,
      isPrivate: false,
      archived: Boolean(raw.archived),
    };
  } catch {
    return null;
  }
}

async function fetchGithubRepoLanguages(
  fullName: string,
  options: { fetchImpl: typeof fetch; signal?: AbortSignal },
): Promise<string[]> {
  try {
    const response = await options.fetchImpl(`${GITHUB_API_BASE}/repos/${fullName}/languages`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': GITHUB_USER_AGENT,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: options.signal,
    });
    if (!response.ok) {
      return [];
    }
    const raw = (await response.json()) as Record<string, number>;
    return Object.entries(raw)
      .sort((a, b) => b[1] - a[1])
      .map(([language]) => language);
  } catch {
    return [];
  }
}

function toCodeRepository(
  candidate: GithubCandidate,
  metadata: GithubRepoMetadata | null,
  retrievedAt: string | null,
): TeamCodeRepository {
  const description = metadata?.description ?? candidate.descriptionHint ?? null;
  const languages = metadata?.languages?.length ? metadata.languages : null;
  const lastActivity = metadata?.lastActivity ?? null;
  const seasons = inferSeasonsFromText(`${description ?? ''} ${candidate.name} ${candidate.evidence}`);
  const robotControllerType = inferRobotControllerType(description, languages);

  return {
    url: candidate.url,
    owner: candidate.owner,
    name: candidate.name,
    fullName: candidate.fullName,
    seasons,
    robotControllerType,
    languages,
    lastActivity,
    description,
    evidence: candidate.evidence,
    evidenceKind: candidate.evidenceKind,
    ownershipConfidence: candidate.ownershipConfidence,
    confirmationState: 'unconfirmed' satisfies LinkConfirmation,
    source: GITHUB_SOURCE,
    retrievedAt,
  };
}

/**
 * Verify and store public GitHub repos for teams.
 * Default path: candidates from existing links (website / OA / GM0).
 * Optional search hits must pass {@link evaluateGithubSearchOwnership}.
 */
export async function applyGithubRepoEnrichment(
  teams: Team[],
  options?: {
    retrievedAt?: string | null;
    fetchImpl?: typeof fetch;
    /** Optional search hits keyed by team number (tests / careful operators). */
    searchHitsByTeam?: Map<number, GithubSearchHit[]>;
    /** When false, skip GitHub API metadata (still stores URL/owner/evidence). Default true. */
    fetchMetadata?: boolean;
  },
): Promise<ApplyGithubReposResult> {
  const retrievedAt = options?.retrievedAt ?? null;
  const fetchMetadata = options?.fetchMetadata !== false;
  let matchedTeams = 0;
  let reposAdded = 0;
  let candidatesSeen = 0;
  let rejectedNumberOnly = 0;
  let skippedPrivateOrInvalid = 0;

  for (const team of teams) {
    const declared = collectGithubCandidatesFromLinks(team);
    const declaredUrls = new Set(declared.map((candidate) => candidate.url));
    const candidates = new Map<string, GithubCandidate>();

    for (const candidate of declared) {
      candidates.set(candidate.url, candidate);
    }

    const searchHits = options?.searchHitsByTeam?.get(team.number) ?? [];
    for (const hit of searchHits) {
      candidatesSeen += 1;
      const verdict = evaluateGithubSearchOwnership({
        teamNumber: team.number,
        teamName: team.latestName,
        hit,
        declaredUrls,
      });
      if (!verdict.accepted) {
        if (/number-only/i.test(verdict.reason)) {
          rejectedNumberOnly += 1;
        }
        continue;
      }

      const parsed = parseGithubRepoUrl(hit.htmlUrl) ?? parseGithubRepoUrl(`https://github.com/${hit.fullName}`);
      if (!parsed || !isAllowedPublicTeamLink(parsed.url, team)) {
        skippedPrivateOrInvalid += 1;
        continue;
      }

      if (candidates.has(parsed.url)) {
        continue;
      }

      const evidenceKind = verdict.evidenceKind ?? 'search-corroborated';
      candidates.set(parsed.url, {
        url: parsed.url,
        owner: parsed.owner,
        name: parsed.name,
        fullName: parsed.fullName,
        evidenceKind,
        source: GITHUB_SOURCE,
        evidence: evidenceTextForCandidate(team.number, evidenceKind, null, hit),
        ownershipConfidence: confidenceForKind(evidenceKind),
        descriptionHint: hit.description ?? null,
      });
    }

    candidatesSeen += declared.length;
    if (candidates.size === 0) {
      continue;
    }

    matchedTeams += 1;
    const existing = new Map((team.codeRepositories ?? []).map((repo) => [repo.url, repo]));
    const before = existing.size;

    for (const candidate of candidates.values()) {
      let metadata: GithubRepoMetadata | null = null;
      if (fetchMetadata) {
        metadata = await fetchGithubRepoMetadata(candidate.fullName, {
          fetchImpl: options?.fetchImpl,
        });
        if (metadata?.isPrivate) {
          skippedPrivateOrInvalid += 1;
          continue;
        }
      }

      const repo = toCodeRepository(candidate, metadata, retrievedAt);
      const prior = existing.get(repo.url);
      if (!prior) {
        existing.set(repo.url, repo);
        continue;
      }

      existing.set(repo.url, {
        ...prior,
        ...repo,
        ownershipConfidence:
          confidenceRank(prior.ownershipConfidence) >= confidenceRank(repo.ownershipConfidence)
            ? prior.ownershipConfidence
            : repo.ownershipConfidence,
        evidence: repo.evidence || prior.evidence,
        languages: repo.languages ?? prior.languages,
        lastActivity: repo.lastActivity ?? prior.lastActivity,
        description: repo.description ?? prior.description,
        seasons: repo.seasons ?? prior.seasons,
        robotControllerType: repo.robotControllerType ?? prior.robotControllerType,
      });
    }

    reposAdded += Math.max(0, existing.size - before);
    team.codeRepositories = [...existing.values()].sort(
      (a, b) => a.fullName.localeCompare(b.fullName) || a.url.localeCompare(b.url),
    );
  }

  return {
    matchedTeams,
    reposAdded,
    candidatesSeen,
    rejectedNumberOnly,
    skippedPrivateOrInvalid,
  };
}
