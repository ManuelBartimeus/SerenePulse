import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PortalEnv } from '@serene/contracts';
import { deviceId, type Supabase } from './supabase';

/** Claims added by public.custom_access_token_hook (A-119). */
export interface AppClaims {
  sub: string;
  email?: string | undefined;
  app_roles: string[];
  app_permissions: string[];
  app_branch_ids: string[];
  app_org_scope: boolean;
  app_must_change_password: boolean;
}

function decodeClaims(session: Session | null): AppClaims | null {
  if (!session) return null;
  try {
    const part = session.access_token.split('.')[1] ?? '';
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const c = JSON.parse(json) as Partial<AppClaims>;
    return {
      sub: c.sub ?? '',
      email: c.email,
      app_roles: c.app_roles ?? [],
      app_permissions: c.app_permissions ?? [],
      app_branch_ids: c.app_branch_ids ?? [],
      app_org_scope: c.app_org_scope ?? false,
      app_must_change_password: c.app_must_change_password ?? false,
    };
  } catch {
    return null;
  }
}

export type SignInResult = { ok: true } | { ok: false; message: string };

interface SessionContextValue {
  supabase: Supabase;
  env: PortalEnv;
  ready: boolean;
  session: Session | null;
  claims: AppClaims | null;
  can: (permission: string) => boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  refreshClaims: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  supabase,
  env,
  children,
}: {
  supabase: Supabase;
  env: PortalEnv;
  children: ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  const value = useMemo<SessionContextValue>(() => {
    const claims = decodeClaims(session);
    return {
      supabase,
      env,
      ready,
      session,
      claims,
      can: (permission) => claims?.app_permissions.includes(permission) ?? false,
      async signIn(email, password) {
        let res: Response;
        try {
          res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/auth-sign-in`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', apikey: env.VITE_SUPABASE_ANON_KEY },
            body: JSON.stringify({ email, password, deviceId: deviceId() }),
          });
        } catch {
          return {
            ok: false,
            message:
              'You seem to be offline, or the service is unreachable. Check your connection and try again.',
          };
        }
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          return {
            ok: false,
            message: body.detail ?? "We couldn't sign you in just now. Please try again in a moment.",
          };
        }
        const { data, error } = await supabase.auth.setSession({
          access_token: body.access_token,
          refresh_token: body.refresh_token,
        });
        if (error || !data.session)
          return { ok: false, message: "We couldn't start your session. Please try again." };
        // Publish the session to React now. onAuthStateChange also reports it, but only after this
        // promise has resolved, so a caller that navigated straight away reached the signed-in area
        // while it still looked signed out and was sent back to sign in (the "click twice" bug).
        setSession(data.session);
        return { ok: true };
      },
      async signOut() {
        await supabase.auth.signOut();
      },
      async refreshClaims() {
        const { data } = await supabase.auth.refreshSession();
        setSession(data.session);
      },
    };
  }, [supabase, env, ready, session]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
