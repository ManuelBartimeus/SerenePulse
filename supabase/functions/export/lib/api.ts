// PostgREST and Storage calls for the export and generate-report functions.
// RPCs that apply permissions and branch scope always run with the caller's own JWT.
import { serviceHeaders } from '../../_shared/http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

export interface RpcResult<T> {
  ok: boolean;
  status: number;
  body: T;
  error?: { code?: string; message?: string };
}

async function call<T>(
  fn: string,
  args: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<RpcResult<T>> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => null);
  return res.ok
    ? { ok: true, status: res.status, body: body as T }
    : {
        ok: false,
        status: res.status,
        body: null as T,
        error: (body ?? {}) as { code?: string; message?: string },
      };
}

export function asCaller<T>(token: string, fn: string, args: Record<string, unknown>) {
  return call<T>(fn, args, { apikey: ANON_KEY, authorization: `Bearer ${token}` });
}

export function asService<T>(fn: string, args: Record<string, unknown>) {
  return call<T>(fn, args, serviceHeaders());
}

/** Maps a database error to an HTTP status; messages for 42501/22023/P0002/P0409 are written for users. */
export function statusFor(code: string | undefined): number {
  switch (code) {
    case '42501':
      return 403;
    case 'P0002':
      return 404;
    case 'P0409':
      return 409;
    case '22023':
      return 422;
    case 'PGRST301':
      return 401;
    default:
      return 500;
  }
}

export const CONTENT_TYPES: Record<string, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

export async function upload(path: string, data: Uint8Array, format: string): Promise<void> {
  const h = serviceHeaders();
  delete h['content-type'];
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/reports/${path}`, {
    method: 'POST',
    headers: {
      ...h,
      'content-type': CONTENT_TYPES[format] ?? 'application/octet-stream',
      'x-upsert': 'false',
    },
    body: data,
  });
  if (!res.ok)
    throw new Error(`storage upload failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
}

/** 15-minute signed URL (SPEC FILES). Returns the path relative to the project URL, for the portal to prefix. */
export async function signedPath(path: string, fileName: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/reports/${path}`, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify({ expiresIn: 900 }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.signedURL) throw new Error(`signing failed: HTTP ${res.status}`);
  const rel = String(body.signedURL).startsWith('/storage/v1')
    ? body.signedURL
    : `/storage/v1${body.signedURL}`;
  return `${rel}&download=${encodeURIComponent(fileName)}`;
}

export async function removeObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/reports`, {
    method: 'DELETE',
    headers: serviceHeaders(),
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!res.ok) throw new Error(`storage delete failed: HTTP ${res.status}`);
}
