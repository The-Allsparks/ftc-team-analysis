import type { Team, TeamLink } from '../data/schema';
import { classifyTeamLink, linkPriority } from './ftcParsers';
import {
  isAllowedPublicTeamLink,
  normalizeLinkUrl,
  upsertTeamLink,
} from './linkDiscovery';

/** Upstream gallery RST on the Game Manual 0 GitHub repo (bounded single-file fetch). */
export const GM0_GALLERY_RST_URL =
  'https://raw.githubusercontent.com/gamemanual0/gm0/main/source/docs/appendix/gallery.rst';
/** Rendered gallery page used for attribution / deep-link targets (not copied prose). */
export const GM0_GALLERY_PAGE_URL = 'https://gm0.org/en/latest/docs/appendix/gallery.html';
export const GM0_SOURCE = 'Game Manual 0 (gallery)';
export const GM0_USER_AGENT = 'Nevada FTC Team Explorer GM0 gallery enrichment';

export type Gm0GalleryResource = {
  label: string;
  url: string;
};

export type Gm0GalleryEntry = {
  teamNumber: number | null;
  teamName: string;
  seasonLabel: string | null;
  heading: string;
  resources: Gm0GalleryResource[];
  /** True when the heading lacked an exact leading team number (name-only / ambiguous). */
  rejectedAsAmbiguous: boolean;
  rejectReason?: string;
};

export type ApplyGm0GalleryResult = {
  matchedTeams: number;
  linksAdded: number;
  skippedAmbiguous: number;
  skippedNoResources: number;
};

const RST_SEASON_UNDERLINE = /^-{3,}\s*$/;
const RST_TEAM_UNDERLINE = /^\^{3,}\s*$/;
const RST_LINK =
  /^-\s*`([^`<]+)\s*<((?:https?:)?\/\/[^>]+|(?:https?:\/\/[^>]+))>`_{1,2}\s*$/i;
const HTML_HEADING =
  /<h([23])[^>]*>\s*([^<]+?)\s*(?:<a\b[^>]*>.*?<\/a>)?\s*<\/h\1>/gi;
const HTML_ANCHOR = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>\s*([^<]*?)\s*<\/a>/gi;

/**
 * Exact numeric team number only (1–5 digits) at the start of a gallery heading.
 * Name-only headings are rejected — never matched by team name alone.
 */
export function parseGm0TeamHeading(heading: string): {
  teamNumber: number | null;
  teamName: string;
  rejectedAsAmbiguous: boolean;
  rejectReason?: string;
} {
  const trimmed = heading.replace(/\s+/g, ' ').trim();
  if (!trimmed) {
    return {
      teamNumber: null,
      teamName: '',
      rejectedAsAmbiguous: true,
      rejectReason: 'empty heading',
    };
  }

  const exact = /^(\d{1,5})\s+(.+)$/.exec(trimmed);
  if (exact) {
    const teamNumber = Number(exact[1]);
    const teamName = exact[2]!.trim();
    if (!Number.isInteger(teamNumber) || teamNumber <= 0 || !teamName) {
      return {
        teamNumber: null,
        teamName: trimmed,
        rejectedAsAmbiguous: true,
        rejectReason: 'invalid team number prefix',
      };
    }
    return { teamNumber, teamName, rejectedAsAmbiguous: false };
  }

  if (/^FTC\d{1,5}\b/i.test(trimmed) || /^\d{1,5}[-A-Za-z]/.test(trimmed)) {
    return {
      teamNumber: null,
      teamName: trimmed,
      rejectedAsAmbiguous: true,
      rejectReason: 'prefixed or fuzzy team token (exact leading number required)',
    };
  }

  return {
    teamNumber: null,
    teamName: trimmed,
    rejectedAsAmbiguous: true,
    rejectReason: 'name-only heading (no exact leading team number)',
  };
}

export function isGm0LinkSource(source: string | null | undefined): boolean {
  return Boolean(source && /game manual 0/i.test(source));
}

export function gm0LinkAttribution(link: Pick<TeamLink, 'source' | 'evidence'>): string {
  const parts = [link.source, link.evidence].filter(Boolean);
  return parts.join(' · ');
}

function preferredTypeFromLabel(label: string): TeamLink['type'] | null {
  const lower = label.toLowerCase();
  if (/\bcad\b|onshape|grabcad|thingiverse|3d model|engineering drawing|render\b/.test(lower)) {
    return 'cad';
  }
  if (/\bcode\b|github|gitlab|repo\b/.test(lower)) {
    return 'code';
  }
  if (/\bvideo\b|reveal|behind the bot|match\b|interview\b/.test(lower)) {
    return 'video';
  }
  if (/\bportfolio\b|binder\b|flyer\b|document|drawing\b|pictures?\b|photo/.test(lower)) {
    return 'docs';
  }
  return null;
}

function resourceEvidence(
  teamNumber: number,
  seasonLabel: string | null,
  resourceLabel: string,
): string {
  const season = seasonLabel ? ` season “${seasonLabel}”` : '';
  return (
    `Exact team number match on Game Manual 0 gallery heading` +
    `${season} (${GM0_GALLERY_PAGE_URL}); ` +
    `curated resource “${resourceLabel}”; original URL preserved (link, not copied prose). ` +
    `Enrichment only — not an official competitive result.`
  );
}

function galleryPageEvidence(teamNumber: number, seasonLabel: string | null): string {
  const season = seasonLabel ? ` season “${seasonLabel}”` : '';
  return (
    `Exact team number match on Game Manual 0 gallery heading` +
    `${season}; linking to curated gallery page (copyrighted GM0 prose not copied). ` +
    `Enrichment only — not an official competitive result.`
  );
}

function pushResource(
  entry: Gm0GalleryEntry,
  label: string,
  rawUrl: string,
): void {
  const url = normalizeLinkUrl(rawUrl);
  if (!url || !isAllowedPublicTeamLink(url)) {
    return;
  }
  if (entry.resources.some((resource) => resource.url === url)) {
    return;
  }
  entry.resources.push({ label: label.trim() || 'Resource', url });
}

/**
 * Parse Sphinx/RST gallery structure into entries.
 * Does not copy long copyrighted prose — only headings + outbound resource URLs.
 */
export function parseGm0GalleryRst(rst: string): {
  entries: Gm0GalleryEntry[];
  skippedAmbiguous: number;
} {
  const lines = rst.replace(/\r\n/g, '\n').split('\n');
  const entries: Gm0GalleryEntry[] = [];
  let skippedAmbiguous = 0;
  let seasonLabel: string | null = null;
  let pendingHeading: string | null = null;
  let current: Gm0GalleryEntry | null = null;

  const startEntry = (heading: string) => {
    const parsed = parseGm0TeamHeading(heading);
    current = {
      teamNumber: parsed.teamNumber,
      teamName: parsed.teamName,
      seasonLabel,
      heading: heading.trim(),
      resources: [],
      rejectedAsAmbiguous: parsed.rejectedAsAmbiguous,
      rejectReason: parsed.rejectReason,
    };
    entries.push(current);
    if (parsed.rejectedAsAmbiguous) {
      skippedAmbiguous += 1;
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();
    const next = (lines[index + 1] ?? '').trim();

    if (trimmed && RST_SEASON_UNDERLINE.test(next) && !RST_TEAM_UNDERLINE.test(next)) {
      // Season titles use ----- underlines; team titles use ^^^^^ .
      // Distinguish by underline character already handled; season uses '-'.
      if (/^[\d]{4}/.test(trimmed) || /season|into the deep|center stage|power play|freight|ultimate|skystone|rover|relic|velocity/i.test(trimmed)) {
        seasonLabel = trimmed;
        pendingHeading = null;
        current = null;
        index += 1;
        continue;
      }
    }

    if (trimmed && RST_TEAM_UNDERLINE.test(next)) {
      pendingHeading = trimmed;
      startEntry(trimmed);
      index += 1;
      continue;
    }

    if (!current && pendingHeading) {
      startEntry(pendingHeading);
      pendingHeading = null;
    }

    if (!current) {
      continue;
    }

    const linkMatch = RST_LINK.exec(trimmed);
    if (linkMatch) {
      pushResource(current, linkMatch[1]!.trim(), linkMatch[2]!.trim());
    }
  }

  return { entries, skippedAmbiguous };
}

/**
 * Parse a bounded Sphinx HTML gallery fragment (h2 seasons, h3 team headings, list links).
 */
export function parseGm0GalleryHtml(html: string): {
  entries: Gm0GalleryEntry[];
  skippedAmbiguous: number;
} {
  const entries: Gm0GalleryEntry[] = [];
  let skippedAmbiguous = 0;
  let seasonLabel: string | null = null;

  const headingMatches = [...html.matchAll(HTML_HEADING)];
  for (let i = 0; i < headingMatches.length; i += 1) {
    const match = headingMatches[i]!;
    const level = match[1];
    const text = decodeHtmlEntities(match[2] ?? '').replace(/\s+/g, ' ').trim();
    if (!text) {
      continue;
    }

    if (level === '2') {
      seasonLabel = text;
      continue;
    }

    const parsed = parseGm0TeamHeading(text);
    const start = match.index! + match[0].length;
    const end = headingMatches[i + 1]?.index ?? html.length;
    const slice = html.slice(start, end);
    const resources: Gm0GalleryResource[] = [];

    for (const anchor of slice.matchAll(HTML_ANCHOR)) {
      const href = decodeHtmlEntities(anchor[1] ?? '').trim();
      const label = decodeHtmlEntities(anchor[2] ?? '').trim() || 'Resource';
      if (/^#/.test(href) || /headerlink/i.test(anchor[0])) {
        continue;
      }
      const url = normalizeLinkUrl(href);
      if (!url || !isAllowedPublicTeamLink(url)) {
        continue;
      }
      if (!resources.some((resource) => resource.url === url)) {
        resources.push({ label, url });
      }
    }

    const entry: Gm0GalleryEntry = {
      teamNumber: parsed.teamNumber,
      teamName: parsed.teamName,
      seasonLabel,
      heading: text,
      resources,
      rejectedAsAmbiguous: parsed.rejectedAsAmbiguous,
      rejectReason: parsed.rejectReason,
    };
    entries.push(entry);
    if (parsed.rejectedAsAmbiguous) {
      skippedAmbiguous += 1;
    }
  }

  return { entries, skippedAmbiguous };
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Map a number-matched gallery entry to TeamLink rows (external URLs + gallery page link).
 */
export function teamLinksFromGm0Entry(
  entry: Gm0GalleryEntry,
  options: { teamNumber: number; retrievedAt?: string | null },
): TeamLink[] {
  if (entry.teamNumber == null || entry.teamNumber !== options.teamNumber || entry.rejectedAsAmbiguous) {
    return [];
  }

  const links = new Map<string, TeamLink>();
  const retrievedAt = options.retrievedAt ?? null;
  const teamNumber = options.teamNumber;

  upsertTeamLink(links, GM0_GALLERY_PAGE_URL, {
    source: GM0_SOURCE,
    ownershipConfidence: 'high',
    confirmationState: 'unconfirmed',
    evidence: galleryPageEvidence(teamNumber, entry.seasonLabel),
    notes: 'Game Manual 0 curated gallery listing (link only)',
    retrievedAt,
    liveness: 'unknown',
  });
  const galleryLink = links.get(GM0_GALLERY_PAGE_URL);
  if (galleryLink) {
    galleryLink.type = 'docs';
    galleryLink.label = entry.seasonLabel
      ? `GM0 Gallery (${entry.seasonLabel})`
      : 'GM0 Gallery';
    galleryLink.source = GM0_SOURCE;
  }

  for (const resource of entry.resources) {
    const classified = classifyTeamLink(resource.url);
    const fromLabel = preferredTypeFromLabel(resource.label);
    const type = fromLabel ?? (classified.type !== 'website' ? classified.type : 'other');
    const label =
      resource.label && resource.label.toLowerCase() !== 'resource'
        ? resource.label
        : classified.label;

    upsertTeamLink(links, resource.url, {
      source: GM0_SOURCE,
      ownershipConfidence: 'high',
      confirmationState: 'unconfirmed',
      evidence: resourceEvidence(teamNumber, entry.seasonLabel, resource.label),
      notes: `Game Manual 0 gallery resource (${resource.label})`,
      retrievedAt,
      liveness: 'unknown',
    });

    const stored = links.get(resource.url);
    if (stored) {
      stored.type = type;
      stored.label = label;
      stored.source = GM0_SOURCE;
    }
  }

  return [...links.values()].sort(
    (a, b) => linkPriority(a) - linkPriority(b) || a.label.localeCompare(b.label),
  );
}

/**
 * Attach GM0 gallery resources only on exact `entry.teamNumber === team.number`.
 * Name-only / ambiguous headings never attach.
 */
export function applyGm0GalleryEnrichment(
  teams: Team[],
  entries: Gm0GalleryEntry[],
  options?: { retrievedAt?: string | null },
): ApplyGm0GalleryResult {
  const byNumber = new Map<number, Gm0GalleryEntry[]>();
  let skippedAmbiguous = 0;
  let skippedNoResources = 0;

  for (const entry of entries) {
    if (entry.rejectedAsAmbiguous || entry.teamNumber == null) {
      skippedAmbiguous += 1;
      continue;
    }
    if (entry.resources.length === 0) {
      skippedNoResources += 1;
      continue;
    }
    const list = byNumber.get(entry.teamNumber) ?? [];
    list.push(entry);
    byNumber.set(entry.teamNumber, list);
  }

  let matchedTeams = 0;
  let linksAdded = 0;
  const retrievedAt = options?.retrievedAt ?? null;

  for (const team of teams) {
    const matched = byNumber.get(team.number);
    if (!matched?.length) {
      continue;
    }

    matchedTeams += 1;
    const linkMap = new Map<string, TeamLink>((team.links ?? []).map((link) => [link.url, link]));
    const before = linkMap.size;

    for (const entry of matched) {
      for (const link of teamLinksFromGm0Entry(entry, {
        teamNumber: team.number,
        retrievedAt,
      })) {
        const existing = linkMap.get(link.url);
        if (!existing) {
          linkMap.set(link.url, link);
          continue;
        }

        const next: TeamLink = {
          ...existing,
          ...link,
          ownershipConfidence:
            existing.ownershipConfidence === 'high' || link.ownershipConfidence === 'high'
              ? 'high'
              : link.ownershipConfidence ?? existing.ownershipConfidence,
          source: GM0_SOURCE,
          evidence: link.evidence ?? existing.evidence,
          notes: link.notes ?? existing.notes,
        };
        linkMap.set(link.url, next);
      }
    }

    linksAdded += Math.max(0, linkMap.size - before);
    team.links = [...linkMap.values()].sort(
      (a, b) => linkPriority(a) - linkPriority(b) || a.label.localeCompare(b.label),
    );
  }

  return { matchedTeams, linksAdded, skippedAmbiguous, skippedNoResources };
}

export async function fetchGm0GalleryRst(options?: {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<{ entries: Gm0GalleryEntry[]; skippedAmbiguous: number; raw: string }> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const response = await fetchImpl(GM0_GALLERY_RST_URL, {
    headers: {
      Accept: 'text/plain, text/x-rst, */*',
      'User-Agent': GM0_USER_AGENT,
    },
    signal: options?.signal,
  });

  if (!response.ok) {
    throw new Error(`GM0 gallery RST failed with HTTP ${response.status}`);
  }

  const raw = await response.text();
  // Bound accidental huge responses (gallery is small; reject pathological bodies).
  if (raw.length > 500_000) {
    throw new Error('GM0 gallery RST response exceeded 500KB bound');
  }

  const parsed = parseGm0GalleryRst(raw);
  return { ...parsed, raw };
}
