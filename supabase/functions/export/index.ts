// Data exports (FR-25, M13) and the auditors' audit-log export (M15).
//   POST { action: 'create', kind: 'responses' | 'audit', filters, format: 'csv' | 'xlsx', include_pii?, reason? }
//   POST { action: 'download', file_id }
// Every database call runs with the caller's JWT, so permissions, branch scope (via C's
// analytics.filtered_responses) and PII rules are enforced by the database and audited there.
// Files go to the private bucket "reports" with the service role; downloads are 15-minute signed URLs.
import { corsHeaders, json, problem } from '../_shared/http.ts';
import { asCaller, signedPath, statusFor, upload } from './lib/api.ts';
import { csvHeader, csvRow, type Column } from './lib/escape.ts';
import { buildWorkbook, SheetWriter } from './lib/xlsx.ts';

const PAGE_SIZE = 5000;
const DEADLINE_MS = 55_000;

interface Begin {
  file_id: string;
  total: number;
  columns: Column[];
}
interface Page {
  rows: unknown[][];
  next: number | null;
}

function fail(
  req: Request,
  r: { status: number; error?: { code?: string; message?: string } },
  fallback: string,
) {
  const status = statusFor(r.error?.code);
  return problem(
    req,
    status,
    r.error?.code ?? 'error',
    status === 500 ? fallback : (r.error?.message ?? fallback),
  );
}

async function download(req: Request, token: string, fileId: string) {
  const auth = await asCaller<{ storage_path: string; file_name: string }>(
    token,
    'report_file_authorize_download',
    {
      p_file_id: fileId,
    },
  );
  if (!auth.ok) return fail(req, auth, "We couldn't prepare the download. Please try again.");
  const path = await signedPath(auth.body.storage_path, auth.body.file_name);
  return json(req, 200, { signed_path: path, file_name: auth.body.file_name, expires_in: 900 });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return problem(req, 405, 'method-not-allowed', 'Use POST.');
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return problem(req, 401, 'unauthorized', 'Please sign in again.');

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return problem(req, 400, 'bad-request', 'Send the export settings as JSON.');
  }

  try {
    if (body.action === 'download') return await download(req, token, String(body.file_id ?? ''));
    if (body.action !== 'create') return problem(req, 400, 'bad-request', 'Unknown action.');

    const started = performance.now();
    const format = body.format === 'xlsx' ? 'xlsx' : body.format === 'csv' ? 'csv' : '';
    if (!format) return problem(req, 422, '22023', 'Choose CSV or Excel.');
    const reportKey = body.kind === 'audit' ? 'audit_export' : 'responses_export';
    const begin = await asCaller<Begin>(token, 'export_begin', {
      p_report_key: reportKey,
      p_filters: body.filters ?? {},
      p_format: format,
      p_include_pii: body.include_pii === true,
      p_reason: typeof body.reason === 'string' ? body.reason : null,
    });
    if (!begin.ok) return fail(req, begin, "We couldn't start the export. Please try again.");
    const { file_id: fileId, columns, total } = begin.body;

    const timings = { fetch_ms: 0, build_ms: 0, upload_ms: 0 };
    try {
      const csv: string[] = [];
      const sheet =
        format === 'xlsx'
          ? new SheetWriter({ name: reportKey === 'audit_export' ? 'Audit log' : 'Feedback', columns })
          : null;
      if (!sheet) csv.push(csvHeader(columns));
      let after = 0;
      let rows = 0;
      for (;;) {
        if (performance.now() - started > DEADLINE_MS) {
          throw new Error(`deadline: ${rows} of ${total} rows after ${DEADLINE_MS / 1000}s`);
        }
        const t0 = performance.now();
        const page = await asCaller<Page>(token, 'export_page', {
          p_file_id: fileId,
          p_after: after,
          p_limit: PAGE_SIZE,
        });
        if (!page.ok) throw new Error(page.error?.message ?? `page failed: HTTP ${page.status}`);
        const t1 = performance.now();
        if (sheet) sheet.addRows(page.body.rows);
        else for (const r of page.body.rows) csv.push(csvRow(r, columns));
        timings.fetch_ms += t1 - t0;
        timings.build_ms += performance.now() - t1;
        rows += page.body.rows.length;
        if (page.body.next === null) break;
        after = page.body.next;
      }
      const t2 = performance.now();
      const bytes = sheet ? await buildWorkbook([sheet]) : new TextEncoder().encode(csv.join(''));
      const t3 = performance.now();
      timings.build_ms += t3 - t2;
      const path = `exports/${JSON.parse(atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))).sub}/${fileId}.${format}`;
      await upload(path, bytes, format);
      timings.upload_ms = performance.now() - t3;
      const done = await asCaller(token, 'export_finish', {
        p_file_id: fileId,
        p_storage_path: path,
        p_row_count: rows,
        p_byte_size: bytes.length,
      });
      if (!done.ok) throw new Error(done.error?.message ?? 'finish failed');
      console.log(JSON.stringify({ event: 'export_done', format, rows, bytes: bytes.length, ...timings }));
      const res = await download(req, token, fileId);
      const link = await res.json();
      return json(req, res.status, { ...link, file_id: fileId, rows, bytes: bytes.length, timings });
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      console.error(JSON.stringify({ event: 'export_failed', reason: reason.slice(0, 300) }));
      await asCaller(token, 'export_fail', { p_file_id: fileId, p_error: reason });
      return problem(
        req,
        reason.startsWith('deadline') ? 504 : 500,
        'export-failed',
        reason.startsWith('deadline')
          ? 'This export is too large to finish in one minute. Narrow the period or filters and try again.'
          : "The export couldn't be completed. Please try again; if it keeps happening, contact your system administrator.",
      );
    }
  } catch (e) {
    console.error(JSON.stringify({ event: 'export_error', reason: String(e).slice(0, 300) }));
    return problem(req, 500, 'error', 'Something went wrong on our side. Please try again.');
  }
});
