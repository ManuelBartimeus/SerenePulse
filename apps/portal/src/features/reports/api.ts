// Calls to the `export` and `generate-report` Edge Functions with the signed-in user's JWT, plus
// signed-URL downloads (15 minutes, SPEC FILES). The database re-checks permissions on every call.
import { useSession } from '../../lib/session';

export interface FunctionError {
  message: string;
  code?: string | undefined;
  status: number;
}

export function useFunctions() {
  const { session, env } = useSession();
  async function call<T>(name: 'export' | 'generate-report', body: Record<string, unknown>): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: env.VITE_SUPABASE_ANON_KEY,
          authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw {
        status: 0,
        message:
          'You seem to be offline, or the service is unreachable. Check your connection and try again.',
      } satisfies FunctionError;
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw {
        status: res.status,
        code: json.type,
        message:
          res.status === 401
            ? 'Your session has expired. Please sign in again.'
            : (json.detail ?? 'Something went wrong on our side. Please try again.'),
      } satisfies FunctionError;
    }
    return json as T;
  }

  /** Starts the browser download of a signed path returned by the export function. */
  function openSigned(signedPath: string, fileName: string) {
    const a = document.createElement('a');
    a.href = `${env.VITE_SUPABASE_URL}${signedPath}`;
    a.download = fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function download(fileId: string) {
    const r = await call<{ signed_path: string; file_name: string }>('export', {
      action: 'download',
      file_id: fileId,
    });
    openSigned(r.signed_path, r.file_name);
  }

  return { call, download, openSigned };
}

export function functionErrorMessage(e: unknown): string {
  return (e as FunctionError | undefined)?.message ?? 'Something went wrong. Please try again.';
}

export interface ReportFile {
  id: string;
  report_key: string;
  kind: 'export' | 'report';
  schedule_id: string | null;
  run_id: string | null;
  format: 'csv' | 'xlsx' | 'pdf';
  status: 'pending' | 'ready' | 'failed' | 'expired';
  row_count: number | null;
  byte_size: number | null;
  contains_pii: boolean;
  period_from: string | null;
  period_to: string | null;
  error: string | null;
  created_at: string;
  expires_at: string;
  report_schedules?: { name: string } | null;
}

export const FORMAT_LABEL: Record<string, string> = { csv: 'CSV', xlsx: 'Excel', pdf: 'PDF' };
