import { describeEnvError, portalEnvSchema, type PortalEnv } from '@serene/contracts';

export type ConfigResult = { ok: true; env: PortalEnv } | { ok: false; problem: string };

/** Validates the build-time environment. A secret key in the bundle is a hard failure. */
export function loadConfig(): ConfigResult {
  const parsed = portalEnvSchema.safeParse(import.meta.env);
  return parsed.success
    ? { ok: true, env: parsed.data }
    : { ok: false, problem: describeEnvError(parsed.error) };
}
