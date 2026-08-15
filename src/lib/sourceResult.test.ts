import { describe, expect, it } from 'vitest';
import {
  failureFromHttpStatus,
  failureFromUnknown,
  HttpStatusError,
  isCacheableSuccess,
  mapHttpStatusToSourceState,
  userMessageFor,
} from './sourceResult';

describe('mapHttpStatusToSourceState', () => {
  it('maps common HTTP statuses', () => {
    expect(mapHttpStatusToSourceState(404)).toBe('no_record');
    expect(mapHttpStatusToSourceState(429)).toBe('rate_limited');
    expect(mapHttpStatusToSourceState(401)).toBe('auth_failure');
    expect(mapHttpStatusToSourceState(403)).toBe('auth_failure');
    expect(mapHttpStatusToSourceState(500)).toBe('upstream_unavailable');
    expect(mapHttpStatusToSourceState(502)).toBe('upstream_unavailable');
    expect(mapHttpStatusToSourceState(400)).toBe('proxy_failure');
    expect(mapHttpStatusToSourceState(200)).toBe('available');
  });
});

describe('failureFromHttpStatus', () => {
  it('never treats 404 as a cacheable success failure envelope', () => {
    const result = failureFromHttpStatus(404, 'FTCScout', 'GET /x failed with 404');
    expect(result.ok).toBe(false);
    expect(result.state).toBe('upstream_unavailable');
    expect(isCacheableSuccess(result)).toBe(false);
  });

  it('maps 429 and 5xx to failure states with calm user copy', () => {
    const limited = failureFromHttpStatus(429, 'FTCScout', 'FTCScout GET /x failed with 429');
    expect(limited).toMatchObject({
      ok: false,
      state: 'rate_limited',
      userMessage: userMessageFor('rate_limited', 'FTCScout'),
      diagnostics: 'FTCScout GET /x failed with 429',
    });

    const unavailable = failureFromHttpStatus(503, 'Portfolio Lab', 'failed with 503');
    expect(unavailable.state).toBe('upstream_unavailable');
    expect(unavailable.userMessage).toContain('temporarily unavailable');
  });
});

describe('failureFromUnknown', () => {
  it('maps HttpStatusError and network TypeError', () => {
    expect(failureFromUnknown(new HttpStatusError('failed with 502', 502), 'FTC Events').state).toBe(
      'upstream_unavailable',
    );
    expect(failureFromUnknown(new TypeError('Failed to fetch'), 'FTCScout').state).toBe('network_failure');
  });

  it('maps status codes embedded in Error messages', () => {
    expect(failureFromUnknown(new Error('GET /path failed with 429'), 'FTCScout').state).toBe('rate_limited');
    expect(failureFromUnknown(new Error('avatar stylesheet failed with 500'), 'Team avatars').state).toBe(
      'upstream_unavailable',
    );
  });

  it('maps parse failures', () => {
    expect(
      failureFromUnknown(new Error('Portfolio Lab catalog marker was not found in the page HTML.'), 'Portfolio Lab')
        .state,
    ).toBe('parse_failure');
  });
});

describe('userMessageFor', () => {
  it('keeps user-facing copy non-alarming', () => {
    expect(userMessageFor('rate_limited', 'FTCScout')).not.toMatch(/exception|stack|trace/i);
    expect(userMessageFor('upstream_unavailable', 'FTC Events')).toContain('temporarily unavailable');
  });
});
