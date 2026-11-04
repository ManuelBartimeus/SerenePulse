/**
 * Stable problem+json error codes for the public survey API (RFC 9457).
 * The customer-facing copy lives in packages/i18n; these codes never change once shipped.
 */
export const SURVEY_ERROR_CODES = {
  alreadyShared: { code: 'already-shared', status: 409 },
  sessionExpired: { code: 'session-expired', status: 410 },
  validationFailed: { code: 'validation-failed', status: 422 },
  verificationFailed: { code: 'verification-failed', status: 403 },
  rateLimited: { code: 'rate-limited', status: 429 },
  badOrigin: { code: 'bad-origin', status: 403 },
  unavailable: { code: 'unavailable', status: 503 },
} as const;

export type SurveyErrorKey = keyof typeof SURVEY_ERROR_CODES;

export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  reference?: string;
  request_id: string;
}
