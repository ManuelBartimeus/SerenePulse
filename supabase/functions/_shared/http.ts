// Shared helpers for Edge Functions: CORS for the portal origins and JSON responses.

const LOCAL_ORIGINS = ['http://127.0.0.1:5173', 'http://localhost:5173'];

function allowedOrigins(): string[] {
  const portal = Deno.env.get('PORTAL_URL');
  return Deno.env.get('APP_ENV') === 'production'
    ? [portal ?? '']
    : [...LOCAL_ORIGINS, ...(portal ? [portal] : [])];
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  return allowedOrigins().includes(origin)
    ? {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type, authorization, apikey, x-client-info',
        'access-control-max-age': '600',
        vary: 'origin',
      }
    : { vary: 'origin' };
}

export function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...corsHeaders(req) },
  });
}

/** problem+json body with a stable code and a message that is safe to show the user. */
export function problem(req: Request, status: number, code: string, detail: string): Response {
  return json(req, status, { type: code, title: detail, status, detail, request_id: crypto.randomUUID() });
}

export function serviceHeaders(): Record<string, string> {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return {
    apikey: key,
    'content-type': 'application/json',
    ...(key.startsWith('eyJ') ? { authorization: `Bearer ${key}` } : {}),
  };
}

export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`rpc ${fn} failed: HTTP ${res.status}`);
  return (await res.json()) as T;
}
