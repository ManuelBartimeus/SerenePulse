import { describeEnvError, surveyWorkerEnvSchema, type SurveyWorkerEnv } from '@serene/contracts';

export type Bindings = Record<string, string | undefined>;

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
