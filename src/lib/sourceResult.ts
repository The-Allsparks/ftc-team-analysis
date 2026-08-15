import type { LiveSourceMeta } from '../data/schema';

export const SOURCE_SUCCESS_STATES = ['available', 'no_record', 'not_published', 'stale'] as const;
export const SOURCE_FAILURE_STATES = [
  'rate_limited',
  'network_failure',
  'proxy_failure',
  'auth_failure',
  'parse_failure',
  'upstream_unavailable',
] as const;

export type SourceSuccessState = (typeof SOURCE_SUCCESS_STATES)[number];
export type SourceFailureState = (typeof SOURCE_FAILURE_STATES)[number];
export type SourceState = SourceSuccessState | SourceFailureState;

export type SourceSuccess<T> = {
  ok: true;
  state: SourceSuccessState;
  data: T;
  diagnostics?: string;
};

export type SourceFailure<T = never> = {
  ok: false;
  state: SourceFailureState;
  data?: T;
  userMessage: string;
  diagnostics: string;
};

export type SourceResult<T> = SourceSuccess<T> | SourceFailure<T>;

/** Lightweight provenance attached to live team-season rows (not part of seed JSON). */
export type { LiveSourceMeta };

export class HttpStatusError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'HttpStatusError';
    this.status = status;
  }
}

export function isCacheableSuccess<T>(result: SourceResult<T>): result is SourceSuccess<T> {
  return result.ok;
}

export function isSourceFailureState(state: SourceState): state is SourceFailureState {
  return (SOURCE_FAILURE_STATES as readonly string[]).includes(state);
}

export function mapHttpStatusToSourceState(status: number): SourceState {
  if (status === 404) {
    return 'no_record';
  }

  if (status === 429) {
    return 'rate_limited';
  }

  if (status === 401 || status === 403) {
    return 'auth_failure';
  }

  if (status >= 500 && status <= 599) {
    return 'upstream_unavailable';
  }

  if (status >= 400 && status <= 499) {
    return 'proxy_failure';
  }

  return 'available';
}

export function userMessageFor(state: SourceState, sourceLabel: string): string {
  switch (state) {
    case 'available':
      return `${sourceLabel} data is available.`;
    case 'no_record':
      return `${sourceLabel} has no record for this request yet.`;
    case 'not_published':
      return `${sourceLabel} has not published this season yet.`;
    case 'stale':
      return `Showing saved ${sourceLabel} data while a refresh is unavailable.`;
    case 'rate_limited':
      return `${sourceLabel} is busy right now. Try again in a few minutes.`;
    case 'network_failure':
      return `Could not reach ${sourceLabel}. Check your connection and try again.`;
    case 'proxy_failure':
      return `${sourceLabel} could not be reached through the live proxy.`;
    case 'auth_failure':
      return `${sourceLabel} refused this request.`;
    case 'parse_failure':
      return `${sourceLabel} returned data that could not be read.`;
    case 'upstream_unavailable':
      return `${sourceLabel} is temporarily unavailable.`;
  }
}

function failureStateFromHttpStatus(status: number): SourceFailureState {
  const mapped = mapHttpStatusToSourceState(status);

  if (isSourceFailureState(mapped)) {
    return mapped;
  }

  return 'upstream_unavailable';
}

export function failureFromHttpStatus(
  status: number,
  sourceLabel: string,
  diagnostics: string,
): SourceFailure {
  const state = failureStateFromHttpStatus(status);

  return {
    ok: false,
    state,
    userMessage: userMessageFor(state, sourceLabel),
    diagnostics,
  };
}

export function failureFromUnknown(error: unknown, sourceLabel: string): SourceFailure {
  if (error instanceof HttpStatusError) {
    return failureFromHttpStatus(error.status, sourceLabel, error.message);
  }

  if (error instanceof TypeError) {
    return {
      ok: false,
      state: 'network_failure',
      userMessage: userMessageFor('network_failure', sourceLabel),
      diagnostics: error.message,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  const statusMatch = message.match(/\b([45]\d{2})\b/);

  if (statusMatch) {
    return failureFromHttpStatus(Number(statusMatch[1]), sourceLabel, message);
  }

  if (/JSON|parse|SyntaxError|marker was not found|unexpected token/i.test(message)) {
    return {
      ok: false,
      state: 'parse_failure',
      userMessage: userMessageFor('parse_failure', sourceLabel),
      diagnostics: message,
    };
  }

  return {
    ok: false,
    state: 'upstream_unavailable',
    userMessage: userMessageFor('upstream_unavailable', sourceLabel),
    diagnostics: message,
  };
}

export function toLiveSourceMeta<T>(result: SourceResult<T>): LiveSourceMeta {
  if (result.ok) {
    return {
      ok: true,
      state: result.state,
      diagnostics: result.diagnostics,
    };
  }

  return {
    ok: false,
    state: result.state,
    userMessage: result.userMessage,
    diagnostics: result.diagnostics,
  };
}
