import { z } from 'zod';

/**
 * Runtime configuration schemas. Each app parses its environment once at startup
 * and refuses to run when something is missing or malformed (fail fast, MS-01).
 */

const appEnv = z.enum(['local', 'staging', 'production']);
const url = z.url({ protocol: /^https?$/ });
const secret = z.string().min(32, 'must be at least 32 characters');

/** A browser bundle must never contain a value matching either of these. */
const SECRET_KEY_PREFIX = /^sb_secret_/;
const SERVICE_ROLE_CLAIM = /"role"\s*:\s*"service_role"/;

export function looksLikeSecretKey(value: string): boolean {
  if (SECRET_KEY_PREFIX.test(value)) return true;
  const payload = value.split('.')[1];
  if (!payload) return false;
  try {
    return SERVICE_ROLE_CLAIM.test(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return false;
  }
}

const publicKey = z
  .string()
  .min(20)
  .refine((v) => !looksLikeSecretKey(v), 'a secret key was supplied where a public key is expected');

export const surveyWorkerEnvSchema = z.object({
  APP_ENV: appEnv,
  SUPABASE_URL: url,
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SURVEY_HMAC_KEY: secret,
  SENTRY_DSN: z.union([url, z.literal('')]).default(''),
  TURNSTILE_SITE_KEY: z.string().default(''),
  TURNSTILE_SECRET_KEY: z.string().default(''),
  CF_WEB_ANALYTICS_TOKEN: z.string().default(''),
  GIT_SHA: z.string().default('dev'),
});
export type SurveyWorkerEnv = z.infer<typeof surveyWorkerEnvSchema>;

export const portalEnvSchema = z.object({
  VITE_APP_ENV: appEnv,
  VITE_SUPABASE_URL: url,
  VITE_SUPABASE_ANON_KEY: publicKey,
  VITE_SENTRY_DSN: z.union([url, z.literal('')]).default(''),
  /** Public survey origin, printed on QR posters and in the SMS-link guide (M05). */
  VITE_SURVEY_URL: url.default('http://127.0.0.1:8787'),
});
export type PortalEnv = z.infer<typeof portalEnvSchema>;

/** Formats a ZodError without echoing values (they may be secrets). */
export function describeEnvError(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
}
