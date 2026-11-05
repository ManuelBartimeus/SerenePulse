import type { SurveyWorkerEnv } from '@serene/contracts';

const RPC_TIMEOUT_MS = 3000;

/**
 * New-format keys (sb_secret_…) are accepted only in the `apikey` header; the gateway mints the
 * JWT itself. Legacy service_role keys are JWTs and must also be sent as the bearer token.
 */
export function supabaseHeaders(key: string): Record<string, string> {
  const headers: Record<string, string> = { apikey: key, 'content-type': 'application/json' };
  if (key.startsWith('eyJ')) headers.authorization = `Bearer ${key}`;
  return headers;
}

/** A failed PostgREST call. `status` 0 means the database could not be reached at all. */
export class RpcError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
    readonly details: string | undefined,
  ) {
    super(message);
  }
}

/**
 * Calls one of the narrow SECURITY DEFINER functions the Worker is allowed to use.
 * The Worker never reads survey tables directly (docs/architecture/system.md, boundaries).
 */
export async function callRpc<T>(
  env: SurveyWorkerEnv,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: supabaseHeaders(env.SUPABASE_SERVICE_ROLE_KEY),
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    });
  } catch (err) {
    throw new RpcError(0, undefined, `rpc ${fn} unreachable: ${(err as Error).name}`, undefined);
  }
  if (!res.ok) {
    let body: { code?: string; message?: string; details?: string } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      // not JSON (gateway error page); keep the status only
    }
    throw new RpcError(
      res.status,
      body.code,
      body.code === 'P0001' && body.message ? body.message : `rpc ${fn} failed with HTTP ${res.status}`,
      body.details ?? undefined,
    );
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Privacy-notice settings (M16). Read with the service key; only these keys, never anything else. */
export const PRIVACY_SETTING_KEYS = [
  'company_legal_name',
  'support_phone',
  'support_email',
  'data_protection_contact',
  'dpc_registration_number',
] as const;
export type PrivacySettings = Partial<Record<(typeof PRIVACY_SETTING_KEYS)[number], string>>;

let settingsCache: { at: number; url: string; value: PrivacySettings } | undefined;
const SETTINGS_TTL_MS = 5 * 60 * 1000;

export async function readPrivacySettings(env: SurveyWorkerEnv): Promise<PrivacySettings> {
  if (
    settingsCache &&
    settingsCache.url === env.SUPABASE_URL &&
    Date.now() - settingsCache.at < SETTINGS_TTL_MS
  )
    return settingsCache.value;
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/settings?select=key,value&key=in.(${PRIVACY_SETTING_KEYS.join(',')})`,
    { headers: supabaseHeaders(env.SUPABASE_SERVICE_ROLE_KEY), signal: AbortSignal.timeout(RPC_TIMEOUT_MS) },
  );
  if (!res.ok)
    throw new RpcError(res.status, undefined, `settings read failed with HTTP ${res.status}`, undefined);
  const rows = (await res.json()) as { key: string; value: unknown }[];
  const value: PrivacySettings = {};
  for (const row of rows) {
    if (
      typeof row.value === 'string' &&
      row.value.trim() &&
      (PRIVACY_SETTING_KEYS as readonly string[]).includes(row.key)
    )
      value[row.key as keyof PrivacySettings] = row.value.trim();
  }
  settingsCache = { at: Date.now(), url: env.SUPABASE_URL, value };
  return value;
}

/** Test hook. */
export function resetSettingsCache(): void {
  settingsCache = undefined;
}
