// "Download all documents": every file attached to one proposal, in one zip.
//
// Files are fetched from private Storage with the signed-in staff member's own session (Storage RLS
// applies, nothing is made public), checked against the SHA-256 recorded when the customer uploaded
// them, and packed in the browser. Photos and PDFs are already compressed, so entries are stored
// as they are (no recompression): the zip builds instantly and each file comes out byte-identical.
import { formById } from '@serene/proposals';
import type { Supabase } from '../../lib/supabase';
import { downloadBytes, type ProposalFileRow } from './api';
import { humanise } from './format';

export interface ZipPlanEntry {
  file: ProposalFileRow;
  /** Name inside the zip: numbered in upload order, labelled with the form's question. */
  name: string;
}

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
};

/** Characters Windows, macOS and zip tools all accept in a file name. */
export function safeSegment(s: string, max = 80): string {
  const cleaned = s
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '');
  return cleaned.slice(0, max).trim() || 'file';
}

/** What the file is: the form's question for it ("Front, with the number plate"), else its kind. */
export function fileLabel(
  file: Pick<ProposalFileRow, 'field_id' | 'kind'>,
  formId: string | undefined,
): string {
  const def = formId ? formById(formId) : undefined;
  if (def) {
    for (const step of def.steps)
      for (const section of step.sections)
        for (const f of section.fields) if (f.id === file.field_id && f.type === 'file') return f.label;
  }
  return humanise(file.kind);
}

/**
 * Names for every file, unique within the zip and in upload order:
 *   "01 A photo of your face - face.png", "02 Vehicle registration document (DVLA) - dvla.png" …
 */
export function planZip(files: readonly ProposalFileRow[], formId?: string): ZipPlanEntry[] {
  const ordered = [...files].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
  const width = Math.max(2, String(ordered.length).length);
  const used = new Set<string>();
  return ordered.map((file, i) => {
    const ext = EXT_BY_MIME[file.mime] ?? file.original_name?.split('.').pop()?.toLowerCase() ?? 'bin';
    const original = file.original_name ? file.original_name.replace(/\.[A-Za-z0-9]{1,5}$/, '') : '';
    const label = safeSegment(fileLabel(file, formId), 70);
    const base = safeSegment(
      `${String(i + 1).padStart(width, '0')} ${label}${original ? ` - ${safeSegment(original, 60)}` : ''}`,
      150,
    );
    let name = `${base}.${ext}`;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n}).${ext}`;
    used.add(name.toLowerCase());
    return { file, name };
  });
}

/** The zip's own file name, e.g. "PRP-26-000027 documents.zip". */
export const zipName = (proposalNo: string) => `${safeSegment(proposalNo, 40)} documents.zip`;

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type Integrity = 'verified' | 'mismatch' | 'unrecorded';

export interface ManifestRow {
  name: string;
  file: ProposalFileRow;
  integrity: Integrity;
}

/** A plain-text contents list placed in the zip next to the files. */
export function manifestText(proposalNo: string, rows: readonly ManifestRow[], at = new Date()): string {
  const lines = [
    `Serene Insurance - documents attached to proposal ${proposalNo}`,
    `Downloaded ${at.toISOString().replace('T', ' ').slice(0, 19)} UTC from the staff portal.`,
    '',
    'Each file is exactly as the customer uploaded it. "Checked" means its SHA-256 fingerprint',
    'matches the one recorded at upload.',
    '',
  ];
  for (const r of rows) {
    lines.push(r.name);
    lines.push(`    Uploaded: ${r.file.created_at}`);
    lines.push(`    Type: ${r.file.mime}, ${r.file.size} bytes`);
    if (r.file.original_name) lines.push(`    Customer's file name: ${r.file.original_name}`);
    lines.push(
      `    Fingerprint: ${
        r.integrity === 'verified'
          ? `checked (SHA-256 ${r.file.sha256})`
          : r.integrity === 'mismatch'
            ? 'DOES NOT MATCH the one recorded at upload - check with IT before relying on this file'
            : 'none recorded at upload'
      }`,
    );
    lines.push('');
  }
  return lines.join('\r\n');
}

export interface ZipResult {
  bytes: Uint8Array;
  name: string;
  count: number;
  /** Files whose bytes differ from the fingerprint recorded at upload (should never happen). */
  mismatched: string[];
}

/** Runs `fn` over `items` with at most `limit` in flight, keeping the input order. */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Downloads every attachment and returns the zip. Fails as a whole if any file cannot be read, so
 * staff never get a silently incomplete set.
 */
export async function buildAttachmentsZip(
  supabase: Supabase,
  proposal: { proposal_no: string; form_id?: string | null },
  files: readonly ProposalFileRow[],
  onProgress?: (done: number, total: number) => void,
): Promise<ZipResult> {
  if (files.length === 0) throw new Error('This proposal has no documents to download.');
  const plan = planZip(files, proposal.form_id ?? undefined);
  let done = 0;
  onProgress?.(0, plan.length);
  const fetched = await mapLimit(plan, 4, async (entry) => {
    let bytes: Uint8Array;
    try {
      bytes = await downloadBytes(supabase, entry.file.storage_path);
    } catch (e) {
      throw new Error(
        `“${entry.file.original_name ?? humanise(entry.file.kind)}” could not be downloaded (${
          (e as Error).message || 'network error'
        }). Nothing was saved; please try again.`,
      );
    }
    const recorded = entry.file.sha256?.toLowerCase();
    const integrity: Integrity = recorded
      ? (await sha256Hex(bytes)) === recorded
        ? 'verified'
        : 'mismatch'
      : 'unrecorded';
    onProgress?.(++done, plan.length);
    return { ...entry, bytes, integrity };
  });

  const { zipSync, strToU8 } = await import('fflate');
  const tree: Record<string, [Uint8Array, { level: 0; mtime: Date }]> = {};
  for (const f of fetched) tree[f.name] = [f.bytes, { level: 0, mtime: new Date(f.file.created_at) }];
  tree['Contents.txt'] = [
    strToU8(
      manifestText(
        proposal.proposal_no,
        fetched.map((f) => ({ name: f.name, file: f.file, integrity: f.integrity })),
      ),
    ),
    { level: 0, mtime: new Date() },
  ];
  return {
    bytes: zipSync(tree),
    name: zipName(proposal.proposal_no),
    count: fetched.length,
    mismatched: fetched.filter((f) => f.integrity === 'mismatch').map((f) => f.name),
  };
}
