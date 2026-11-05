// RFC 9457 problem+json responses for the survey API (registry: docs/architecture/api.md §1).
import { SURVEY_ERROR_CODES, type SurveyErrorKey } from '@serene/contracts';
import { BASE, COPY } from '../shared/copy';
import { RpcError } from './supabase';

/** Registry codes plus two transport-level codes that are not customer paths. */
export const EXTRA_CODES = {
  badRequest: { code: 'bad-request', status: 400 },
  bodyTooLarge: { code: 'body-too-large', status: 413 },
} as const;
export type ProblemKey = SurveyErrorKey | keyof typeof EXTRA_CODES;
const ALL = { ...SURVEY_ERROR_CODES, ...EXTRA_CODES };

const TITLES: Record<ProblemKey, string> = {
  alreadyShared: COPY.alreadyShared,
  sessionExpired: 'Your session has ended.',
  validationFailed: 'Please check your answers.',
  verificationFailed: COPY.verificationFailed,
  rateLimited: COPY.rateLimited,
  badOrigin: 'Request refused.',
  unavailable: `${COPY.unavailableHeading} ${COPY.unavailableBody}`,
  badRequest: 'Bad request.',
  bodyTooLarge: 'Request too large.',
};

export function problem(
  url: string,
  key: ProblemKey,
  extra: { errors?: unknown; reference?: string } = {},
): Response {
  const { code, status } = ALL[key];
  const body = {
    type: `${new URL(url).origin}${BASE}/errors/${code}`,
    code,
    title: TITLES[key],
    status,
    request_id: crypto.randomUUID(),
    ...extra,
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/problem+json', 'cache-control': 'no-store' },
  });
}

const BY_MESSAGE: Record<string, SurveyErrorKey> = {
  'session-expired': 'sessionExpired',
  'already-shared': 'alreadyShared',
  'validation-failed': 'validationFailed',
  'rate-limited': 'rateLimited',
  unavailable: 'unavailable',
};

/** Maps a PostgREST failure of a survey_* RPC to a registry key. Anything unexpected is `unavailable`. */
export function rpcProblemKey(err: unknown): ProblemKey {
  if (err instanceof RpcError) {
    const key = err.code === 'P0001' ? BY_MESSAGE[err.message] : undefined;
    if (key) return key;
    if (err.code === '22023') return 'badRequest';
  }
  return 'unavailable';
}

/** Field errors sent by survey_submit in the exception DETAIL (JSON array). */
export function rpcFieldErrors(err: unknown): { field: string; code: string }[] {
  if (!(err instanceof RpcError) || !err.details) return [];
  try {
    const parsed = JSON.parse(err.details) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (e): e is { field: string; code: string } =>
            !!e && typeof e === 'object' && typeof e.field === 'string' && typeof e.code === 'string',
        )
      : [];
  } catch {
    return [];
  }
}
