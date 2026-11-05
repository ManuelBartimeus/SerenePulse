// Invite a staff member (A-84). The caller needs users.manage (re-checked live). Supabase sends
// the invite email (24 h, single use); the user lands on the portal's "Set a new password" page.
// Grants are applied with the caller's own JWT, so admin_set_grants records who granted what
// and applies the second-approval rule (A-68).
import { corsHeaders, json, problem, rpc, serviceHeaders } from '../_shared/http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function asCaller(token: string, fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return problem(req, 405, 'method-not-allowed', 'Use POST.');

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const allowed = await asCaller(token, 'me_has_perm', { p_key: 'users.manage' });
  if (!allowed.ok || allowed.body !== true) {
    return problem(req, 403, 'forbidden', "You don't have permission to invite users.");
  }

  let email: string;
  let displayName: string;
  let grants: unknown;
  try {
    const body = await req.json();
    email = String(body.email ?? '')
      .trim()
      .toLowerCase();
    displayName = String(body.displayName ?? '')
      .trim()
      .slice(0, 120);
    grants = body.grants ?? [];
  } catch {
    return problem(req, 400, 'bad-request', 'Send an email, a name and the roles to grant.');
  }
  if (!EMAIL.test(email)) return problem(req, 422, 'invalid-email', 'Enter a valid email address.');
  if (!displayName) return problem(req, 422, 'invalid-name', 'Enter the person’s name.');
  if (!Array.isArray(grants) || grants.length === 0) {
    return problem(
      req,
      422,
      'no-roles',
      'Choose at least one role. A user with no roles cannot use the portal.',
    );
  }

  // Supabase would happily re-send an invite to an existing address, and admin_set_grants would
  // then replace that person's roles. Refuse instead; roles are edited on the user's own row.
  const existing = await rpc<string | null>('auth_account_status', { p_email: email });
  if (existing) {
    return problem(
      req,
      409,
      'already-exists',
      existing === 'invited'
        ? 'This person has already been invited. Edit their roles from the user list instead.'
        : 'Someone with that email already has an account. Edit their roles from the user list instead.',
    );
  }

  const invite = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify({
      email,
      data: { display_name: displayName },
      redirect_to: `${Deno.env.get('PORTAL_URL') ?? 'http://127.0.0.1:5173'}/set-password`,
    }),
  });
  const invited = await invite.json().catch(() => ({}));
  if (invite.status === 422) {
    return problem(req, 409, 'already-exists', 'Someone with that email already has an account.');
  }
  if (!invite.ok) {
    console.error(JSON.stringify({ event: 'invite_failed', status: invite.status }));
    return problem(req, 502, 'invite-failed', "We couldn't send the invitation just now. Please try again.");
  }

  const set = await asCaller(token, 'admin_set_grants', { p_user_id: invited.id, p_grants: grants });
  if (!set.ok) {
    return problem(
      req,
      422,
      'grants-failed',
      `The invitation was sent, but the roles could not be saved: ${set.body?.message ?? 'unknown error'}. ` +
        'Open the user and set their roles.',
    );
  }
  return json(req, 201, { userId: invited.id, pendingApproval: set.body?.pending_approval ?? 0 });
});
