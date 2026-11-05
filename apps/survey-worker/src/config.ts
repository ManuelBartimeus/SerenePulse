import { describeEnvError, surveyWorkerEnvSchema, type SurveyWorkerEnv } from '@serene/contracts';

/** Workers Rate Limiting binding (D-37 replaced the WAF rule). */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** Workers static-assets binding: landing site at `/`, portal SPA at `/admin`. */
export interface AssetsFetcher {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

export type Bindings = Record<string, unknown> & {
  RL_SUBMIT?: RateLimiter;
  RL_API?: RateLimiter;
  ASSETS?: AssetsFetcher;
};

let cached: { source: Bindings; env: SurveyWorkerEnv } | undefined;

/** Parses bindings once per isolate. Throws a message naming the bad keys, never their values. */
export function loadConfig(bindings: Bindings): SurveyWorkerEnv {
  if (cached?.source === bindings) return cached.env;
  const parsed = surveyWorkerEnvSchema.safeParse(bindings);
  if (!parsed.success)
    throw new Error(`Invalid survey worker configuration: ${describeEnvError(parsed.error)}`);
  cached = { source: bindings, env: parsed.data };
  return parsed.data;
}
