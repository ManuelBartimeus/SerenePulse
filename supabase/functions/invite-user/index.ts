// Invite a staff member (A-84) and issue access links (D-45). The caller needs users.manage
// (re-checked live). No email is sent: the function returns a one-time link (24 h, A-153) that the
// administrator copies to the person, who lands on the portal's "Set a new password" page.
//   { email, displayName, grants }   → creates the account, applies grants, returns an invite link
//   { action: 'link', userId }       → new invite link (not yet accepted) or password-reset link
// Grants and link issuing run with the caller's own JWT, so the database records who did what and
// applies the second-approval rule (A-68).
import { corsHeaders, json, problem, rpc, serviceHeaders } from '../_shared/http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const REDIRECT_TO = `${Deno.env.get('PORTAL_URL') ?? 'http://127.0.0.1:5173'}/set-password`;
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

/** Creates the one-time link without sending email. Invites also create the auth user. */
async function generateLink(type: 'invite' | 'recovery', email: string, data?: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify({ type, email, redirect_to: REDIRECT_TO, ...(data ? { data } : {}) }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // GoTrue's message holds no address or secret.
    console.error(
      JSON.stringify({
        event: 'link_failed',
        type,
        status: res.status,
        reason: String(body.msg ?? body.message ?? body.error_code ?? '').slice(0, 200),
      }),
    );
  }
  return { ok: res.ok, status: res.status, id: body.id as string, link: body.action_link as string };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return problem(req, 405, 'method-not-allowed', 'Use POST.');

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const allowed = await asCaller(token, 'me_has_perm', { p_key: 'users.manage' });
  if (!allowed.ok || allowed.body !== true) {
    return problem(req, 403, 'forbidden', "You don't have permission to invite users.");
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return problem(req, 400, 'bad-request', 'Send an email, a name and the roles to grant.');
  }

  if (body.action === 'link') {
    const issued = await asCaller(token, 'admin_issue_access_link', { p_user_id: body.userId });
    if (!issued.ok) {
      return problem(
        req,
        422,
        'link-refused',
        issued.body?.message ?? "We couldn't create a link for this user.",
      );
    }
    const { email, kind } = issued.body as { email: string; kind: 'invite' | 'recovery' };
    const made = await generateLink(kind, email);
    if (!made.ok) {
      return problem(req, 502, 'link-failed', "We couldn't create the link just now. Please try again.");
    }
    return json(req, 200, { kind, link: made.link });
  }

  const email = String(body.email ?? '')
    .trim()
    .toLowerCase();
  const displayName = String(body.displayName ?? '')
    .trim()
    .slice(0, 120);
  const grants = body.grants ?? [];
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

  // An invite for an existing address would reuse that account, and admin_set_grants would then
  // replace that person's roles. Refuse instead; roles are edited on the user's own row.
  const existing = await rpc<string | null>('auth_account_status', { p_email: email });
  if (existing) {
    return problem(
      req,
      409,
      'already-exists',
      existing === 'invited'
        ? 'This person has already been invited. Open them in the user list to copy a new link.'
        : 'Someone with that email already has an account. Edit their roles from the user list instead.',
    );
  }

  const invited = await generateLink('invite', email, { display_name: displayName });
  if (invited.status === 422) {
    return problem(req, 409, 'already-exists', 'Someone with that email already has an account.');
  }
  if (!invited.ok) {
    return problem(
      req,
      502,
      'invite-failed',
      "We couldn't create the invitation just now. Please try again.",
    );
  }

  const set = await asCaller(token, 'admin_set_grants', { p_user_id: invited.id, p_grants: grants });
  if (!set.ok) {
    return problem(
      req,
      422,
      'grants-failed',
      `The account was created, but the roles could not be saved: ${set.body?.message ?? 'unknown error'}. ` +
        'Open the user and set their roles.',
    );
  }
  return json(req, 201, {
    userId: invited.id,
    link: invited.link,
    pendingApproval: set.body?.pending_approval ?? 0,
  });
});
