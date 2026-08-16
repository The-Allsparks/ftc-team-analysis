import { normalizeLinkUrl } from './linkDiscovery';

/** Evidence kinds for associating an Onshape document with an FTC team. */
export type OnshapeCadEvidenceKind = 'declared-link' | 'number-only-search';

export type ParsedOnshapeDocument = {
  documentId: string;
  /** Workspace / version / microversion segment when present (`w` \| `v` \| `m`). */
  wvm: string | null;
  wvmid: string | null;
  elementId: string | null;
  url: string;
};

export type OnshapeCadMatchInput = {
  teamNumber: number;
  teamName: string | null | undefined;
  url: string;
  /**
   * How the URL was found. Declared sources (website / OA / GM0 / On The Web) accept.
   * Number-only Public Documents / search hits must be rejected.
   */
  evidenceKind: OnshapeCadEvidenceKind;
  /** Optional document title/description from a search hit (never enough alone). */
  documentTitle?: string | null;
};

export type OnshapeCadMatchVerdict = {
  accepted: boolean;
  reason: string;
  parsed: ParsedOnshapeDocument | null;
};

const ONSHAPE_HOST = /^(?:[\w-]+\.)?onshape\.com$/i;
const DOC_ID = /^[a-f0-9]{24}$/i;

/**
 * Parse a public Onshape document browser URL. Does not call the API and does not
 * infer team ownership — callers must supply evidence separately.
 */
export function parseOnshapeDocumentUrl(value: string | null | undefined): ParsedOnshapeDocument | null {
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
  if (!ONSHAPE_HOST.test(host)) {
    return null;
  }

  const parts = parsed.pathname.split('/').filter(Boolean);
  const documentsIdx = parts.findIndex((part) => part.toLowerCase() === 'documents');
  if (documentsIdx < 0 || documentsIdx + 1 >= parts.length) {
    return null;
  }

  const documentId = parts[documentsIdx + 1];
  if (!DOC_ID.test(documentId)) {
    return null;
  }

  let wvm: string | null = null;
  let wvmid: string | null = null;
  let elementId: string | null = null;

  const afterDoc = parts.slice(documentsIdx + 2);
  if (afterDoc.length >= 2 && /^(w|v|m)$/i.test(afterDoc[0])) {
    wvm = afterDoc[0].toLowerCase();
    wvmid = afterDoc[1];
    const eIdx = afterDoc.findIndex((part) => part.toLowerCase() === 'e');
    if (eIdx >= 0 && eIdx + 1 < afterDoc.length) {
      elementId = afterDoc[eIdx + 1];
    }
  }

  return {
    documentId: documentId.toLowerCase(),
    wvm,
    wvmid,
    elementId,
    url: normalized,
  };
}

/**
 * Ownership gate for Onshape CAD links.
 * Accept declared URLs; reject number-only search / Public Documents hits.
 */
export function evaluateOnshapeCadMatch(input: OnshapeCadMatchInput): OnshapeCadMatchVerdict {
  const parsed = parseOnshapeDocumentUrl(input.url);
  if (!parsed) {
    return {
      accepted: false,
      reason: 'URL is not a parseable Onshape /documents/{did} link',
      parsed: null,
    };
  }

  if (input.evidenceKind === 'declared-link') {
    return {
      accepted: true,
      reason: 'Declared Onshape URL (website / On The Web / Open Alliance / GM0)',
      parsed,
    };
  }

  // number-only-search and any future search-shaped kinds: hard reject.
  const title = (input.documentTitle ?? '').toLowerCase();
  const numberToken = String(input.teamNumber);
  const titleHasNumber = title.includes(numberToken);
  const nameTokens = (input.teamName ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
  const titleHasName = nameTokens.some((token) => title.includes(token));

  if (titleHasNumber && !titleHasName) {
    return {
      accepted: false,
      reason: 'Rejected number-only Onshape match (team number without declared link or name corroboration)',
      parsed,
    };
  }

  return {
    accepted: false,
    reason: 'Rejected non-declared Onshape match (prefer declared website / OA / GM0 links)',
    parsed,
  };
}

export function onshapeCadAttribution(): string {
  return 'Onshape (linked; not copied)';
}
