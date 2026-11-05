// Scheduled and on-demand reports (MS-12, D-26): PDF (pdf-lib) + XLSX, 30-day files in bucket "reports".
//   Scheduler (pg_cron → pg_net, header x-jobs-secret = Vault jobs_shared_secret):
//     { action: 'run', run_ids: [...] }   build every pending file of these runs
//     { action: 'purge' }                 delete expired files' Storage objects, then their rows
//   Portal (user JWT):
//     { action: 'run_now', schedule_id }  checked by report_schedule_run_now with the caller's JWT
// Figures come from report_run_claim, which builds them under the schedule owner's scope.
// Needs verify_jwt = false (the scheduler has no user JWT); every request is authenticated here.
import { corsHeaders, json, problem } from '../_shared/http.ts';
import { asCaller, asService, removeObjects, upload } from '../export/lib/api.ts';
import { buildWorkbook } from '../export/lib/xlsx.ts';
import { buildModel, type Claim } from './lib/model.ts';
import { renderPdf } from './lib/pdf.ts';
import { reportSheets } from './lib/report-xlsx.ts';
import { secretMatches } from './lib/secret.ts';

const APP_ENV = Deno.env.get('APP_ENV') ?? 'local';

interface RunOutcome {
  run_id: string;
  files: {
    id: string;
    format: string;
    status: 'ready' | 'failed';
    bytes?: number;
    ms?: number;
    error?: string;
  }[];
}

async function processRun(runId: string): Promise<RunOutcome> {
  const claim = await asService<Claim | { failed: true } | null>('report_run_claim', { p_run_id: runId });
  if (!claim.ok) throw new Error(`claim failed: HTTP ${claim.status} ${claim.error?.message ?? ''}`);
  if (!claim.body || 'failed' in claim.body) return { run_id: runId, files: [] };
  const c = claim.body;
  const model = buildModel(c, APP_ENV);
  const out: RunOutcome = { run_id: runId, files: [] };
  for (const f of c.files) {
    const t0 = performance.now();
    try {
      const bytes = f.format === 'pdf' ? await renderPdf(model) : await buildWorkbook(reportSheets(model));
      const path = `scheduled/${c.schedule_id}/${f.id}.${f.format}`;
      await upload(path, bytes, f.format);
      const done = await asService('report_file_complete', {
        p_file_id: f.id,
        p_storage_path: path,
        p_byte_size: bytes.length,
        p_row_count: c.data.summary.n,
      });
      if (!done.ok) throw new Error(done.error?.message ?? 'complete failed');
      out.files.push({
        id: f.id,
        format: f.format,
        status: 'ready',
        bytes: bytes.length,
        ms: performance.now() - t0,
      });
    } catch (e) {
      const reason = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      await asService('report_file_fail', { p_file_id: f.id, p_error: reason });
      out.files.push({ id: f.id, format: f.format, status: 'failed', error: reason });
    }
  }
  console.log(JSON.stringify({ event: 'report_run', run_id: runId, files: out.files }));
  return out;
}

async function purge(): Promise<number> {
  let total = 0;
  for (let i = 0; i < 10; i++) {
    const due = await asService<{ id: string; storage_path: string | null }[]>('report_files_due_purge', {
      p_limit: 500,
    });
    if (!due.ok) throw new Error(`purge list failed: HTTP ${due.status}`);
    if (due.body.length === 0) break;
    await removeObjects(due.body.map((d) => d.storage_path).filter((p): p is string => !!p));
    const gone = await asService<number>('report_files_purged', { p_ids: due.body.map((d) => d.id) });
    if (!gone.ok) throw new Error(`purge rows failed: HTTP ${gone.status}`);
    total += gone.body;
  }
  return total;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return problem(req, 405, 'method-not-allowed', 'Use POST.');
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return problem(req, 400, 'bad-request', 'Send JSON.');
  }

  try {
    const jobSecret = req.headers.get('x-jobs-secret');
    if (jobSecret !== null) {
      if (!(await secretMatches(jobSecret, Deno.env.get('JOBS_SHARED_SECRET')))) {
        return problem(req, 401, 'unauthorized', 'Unauthorized.');
      }
      if (body.action === 'purge') return json(req, 200, { deleted: await purge() });
      if (body.action === 'run' && Array.isArray(body.run_ids)) {
        const results: RunOutcome[] = [];
        for (const id of body.run_ids.slice(0, 50)) results.push(await processRun(String(id)));
        return json(req, 200, { runs: results });
      }
      return problem(req, 400, 'bad-request', 'Unknown action.');
    }

    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token || body.action !== 'run_now')
      return problem(req, 401, 'unauthorized', 'Please sign in again.');
    const started = await asCaller<{ run_id: string }>(token, 'report_schedule_run_now', {
      p_schedule_id: body.schedule_id,
    });
    if (!started.ok) {
      const code = started.error?.code;
      const status = code === '42501' ? 403 : code === 'P0002' ? 404 : code === '22023' ? 422 : 500;
      return problem(
        req,
        status,
        code ?? 'error',
        status === 500 ? "We couldn't start the report. Please try again." : (started.error?.message ?? ''),
      );
    }
    return json(req, 200, await processRun(started.body.run_id));
  } catch (e) {
    console.error(JSON.stringify({ event: 'generate_report_error', reason: String(e).slice(0, 300) }));
    return problem(req, 500, 'error', 'Something went wrong while generating the report.');
  }
});
