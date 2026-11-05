// Server-side Turnstile verification (M05 abuse controls, flows.md §3).
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TIMEOUT_MS = 2000;

export type TurnstileOutcome = 'verified' | 'rejected' | 'outage';

/**
 * `verified` — Cloudflare accepted the token. `rejected` — Cloudflare answered and refused it
 * (403 verification-failed). `outage` — Cloudflare could not be reached or failed internally after
 * one retry: the response is stored as `unverified_turnstile_outage` and excluded from KPIs.
 */
export async function verifyTurnstile(
  secret: string,
  token: string,
  remoteIp: string | null,
  idempotencyKey: string,
): Promise<TurnstileOutcome> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const form = new FormData();
      form.set('secret', secret);
      form.set('response', token);
      if (remoteIp) form.set('remoteip', remoteIp);
      form.set('idempotency_key', idempotencyKey);
      const res = await fetch(SITEVERIFY, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status >= 500) continue;
      if (!res.ok) return 'outage';
      const body = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
      if (body.success) return 'verified';
      const codes = body['error-codes'] ?? [];
      if (codes.includes('internal-error')) continue;
      if (codes.includes('invalid-input-secret') || codes.includes('missing-input-secret')) {
        // Our misconfiguration, not the customer's fault: keep the answers, flag them unverified.
        console.error(JSON.stringify({ event: 'turnstile_secret_invalid' }));
        return 'outage';
      }
      return 'rejected';
    } catch {
      // network failure or timeout: retry once, then treat as outage
    }
  }
  return 'outage';
}
