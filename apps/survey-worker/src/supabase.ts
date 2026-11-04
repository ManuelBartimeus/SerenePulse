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

/**
 * Calls one of the narrow SECURITY DEFINER functions the Worker is allowed to use.
 * The Worker never reads tables directly (docs/architecture/system.md, boundaries).
 */
export async function callRpc<T>(
  env: SurveyWorkerEnv,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: supabaseHeaders(env.SUPABASE_SERVICE_ROLE_KEY),
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`rpc ${fn} failed with HTTP ${res.status}`);
  return (await res.json()) as T;
}
