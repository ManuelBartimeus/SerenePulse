import type { SurveyWorkerEnv } from '@serene/contracts';

const RPC_TIMEOUT_MS = 3000;

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
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`rpc ${fn} failed with HTTP ${res.status}`);
  return (await res.json()) as T;
}
