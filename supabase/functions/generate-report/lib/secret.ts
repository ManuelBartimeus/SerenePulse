// Constant-time comparison of the jobs shared secret (pg_cron → pg_net → generate-report).
// Both values are hashed first so the comparison time doesn't depend on length or content.

export async function secretMatches(given: string | null, expected: string | undefined): Promise<boolean> {
  if (!given || !expected || expected.length < 32) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(given)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ]);
  return timingSafeEqual(new Uint8Array(a), new Uint8Array(b));
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
