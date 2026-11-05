import { createClient } from '@supabase/supabase-js';
import type { PortalEnv } from '@serene/contracts';

/**
 * The portal only ever holds the public (anon/publishable) key. Every read and write runs under
 * the signed-in user's JWT, so RLS and the RPC permission checks always apply (ADR-0003).
 */
export function createSupabase(env: PortalEnv) {
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Invite and password-reset links arrive with the session in the URL fragment.
      detectSessionInUrl: true,
      flowType: 'implicit',
      storageKey: 'serene-cx-auth',
    },
  });
}

export type Supabase = ReturnType<typeof createSupabase>;

/** A stable random id for this browser, used only to recognise new devices at sign-in. */
export function deviceId(): string {
  const KEY = 'serene-cx-device';
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return 'unavailable';
  }
}
