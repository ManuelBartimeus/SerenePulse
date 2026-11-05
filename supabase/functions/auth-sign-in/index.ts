// Staff sign-in: email + password only (D-23, D-44). Adds what Supabase's free plan lacks:
// lockout after 5 failures for 15 minutes, and new-device detection (A-139). Messages never
// reveal whether an account exists (E8).
import { corsHeaders, json, problem, rpc } from '../_shared/http.ts';

const GENERIC_FAILURE =
  "That email and password don't match, or the account is temporarily locked. " +
  'Try again in a few minutes or reset your password.';

type Precheck = { allowed: boolean; reason?: 'locked' | 'suspended'; retry_after_seconds?: number };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return problem(req, 405, 'method-not-allowed', 'Use POST.');

  let email: string;
  let password: string;
  let deviceId: string | undefined;
  try {
    const body = await req.json();
    email = String(body.email ?? '')
      .trim()
      .toLowerCase();
    password = String(body.password ?? '');
    deviceId = typeof body.deviceId === 'string' ? body.deviceId.slice(0, 100) : undefined;
  } catch {
    return problem(req, 400, 'bad-request', 'Enter your email and password.');
  }
  if (!email || !password || email.length > 254 || password.length > 200) {
    return problem(req, 400, 'bad-request', 'Enter your email and password.');
  }

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || null;

  try {
    const pre = await rpc<Precheck>('auth_sign_in_precheck', { p_email: email });
    if (!pre.allowed) {
      // Same wording for locked and suspended: no hint about which accounts exist or their state.
      return problem(req, 401, 'sign-in-failed', GENERIC_FAILURE);
    }

    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '', 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const session = await res.json();

    if (res.status === 429) {
      return problem(
        req,
        429,
        'rate-limited',
        'Too many attempts from this network. Please wait a few minutes.',
      );
    }
    if (!res.ok) {
      // Only a wrong password counts towards the lockout; other refusals (hook, suspended) don't.
      if (res.status === 400)
        await rpc('auth_sign_in_record', { p_email: email, p_success: false, p_ip: ip });
      return problem(req, 401, 'sign-in-failed', GENERIC_FAILURE);
    }

    await rpc('auth_sign_in_record', {
      p_email: email,
      p_success: true,
      p_ip: ip,
      p_device: deviceId ?? null,
    });
    return json(req, 200, {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
    });
  } catch (err) {
    console.error(JSON.stringify({ event: 'sign_in_error', message: (err as Error).message }));
    return problem(
      req,
      503,
      'unavailable',
      "We couldn't sign you in just now. Please try again in a moment.",
    );
  }
});
