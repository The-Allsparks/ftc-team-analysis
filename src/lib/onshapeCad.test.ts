import { describe, expect, it } from 'vitest';
import {
  evaluateOnshapeCadMatch,
  onshapeCadAttribution,
  parseOnshapeDocumentUrl,
} from './onshapeCad';

describe('parseOnshapeDocumentUrl', () => {
  it('parses document / workspace / element URLs', () => {
    expect(
      parseOnshapeDocumentUrl(
        'https://cad.onshape.com/documents/c8f8013d34183b1de74fa930/w/574b77701d8b74987c273500/e/455ef770951fe37de0b8ff08',
      ),
    ).toEqual({
      documentId: 'c8f8013d34183b1de74fa930',
      wvm: 'w',
      wvmid: '574b77701d8b74987c273500',
      elementId: '455ef770951fe37de0b8ff08',
      url: 'https://cad.onshape.com/documents/c8f8013d34183b1de74fa930/w/574b77701d8b74987c273500/e/455ef770951fe37de0b8ff08',
    });
  });

  it('parses document-only URLs and rejects non-Onshape hosts', () => {
    expect(parseOnshapeDocumentUrl('https://cad.onshape.com/documents/e60c4803eaf2ac8be492c18e')).toEqual({
      documentId: 'e60c4803eaf2ac8be492c18e',
      wvm: null,
      wvmid: null,
      elementId: null,
      url: 'https://cad.onshape.com/documents/e60c4803eaf2ac8be492c18e',
    });
    expect(parseOnshapeDocumentUrl('https://grabcad.com/library/example')).toBeNull();
    expect(parseOnshapeDocumentUrl('https://cad.onshape.com/glassworks/explorer/')).toBeNull();
  });
});

describe('evaluateOnshapeCadMatch', () => {
  it('accepts declared Onshape URLs', () => {
    const verdict = evaluateOnshapeCadMatch({
      teamNumber: 16158,
      teamName: 'Allsparks',
      url: 'https://cad.onshape.com/documents/aaaaaaaaaaaaaaaaaaaaaaaa/w/bbbbbbbbbbbbbbbbbbbbbbbb',
      evidenceKind: 'declared-link',
    });
    expect(verdict.accepted).toBe(true);
    expect(verdict.parsed?.documentId).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
    expect(verdict.reason).toMatch(/declared/i);
  });

  it('rejects number-only search hits even when the title contains the team number', () => {
    const verdict = evaluateOnshapeCadMatch({
      teamNumber: 16158,
      teamName: 'Allsparks',
      url: 'https://cad.onshape.com/documents/cccccccccccccccccccccccc',
      evidenceKind: 'number-only-search',
      documentTitle: 'FTC 16158 robot CAD',
    });
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toMatch(/number-only/i);
  });

  it('rejects non-declared matches without a declared link path', () => {
    const verdict = evaluateOnshapeCadMatch({
      teamNumber: 16158,
      teamName: 'Allsparks',
      url: 'https://cad.onshape.com/documents/dddddddddddddddddddddddd',
      evidenceKind: 'number-only-search',
      documentTitle: 'Allsparks FTC drivetrain',
    });
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toMatch(/non-declared|declared/i);
  });
});

describe('onshapeCadAttribution', () => {
  it('states link-not-copy policy', () => {
    expect(onshapeCadAttribution()).toMatch(/linked/i);
    expect(onshapeCadAttribution()).toMatch(/not copied/i);
  });
});
