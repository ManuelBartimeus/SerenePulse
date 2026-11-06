// Completed proposal forms (PDF / Word) and certificates (PDF), rendered in the browser by
// @serene/proposals/render from the stored data, so staff and customers get the same document.
// The renderers (pdf-lib, docx) load only when a document is first needed.
import {
  formById,
  GLOBAL_CONFIRMATIONS,
  productByCode,
  type Answers,
  type CertificateData,
} from '@serene/proposals';
import logoPngUrl from '@serene/ui/assets/serene-logo.png';
import type { Supabase } from '../../lib/supabase';
import { downloadBytes, type ProposalFileRow, type ProposalRow } from './api';

const loadRender = () => import('@serene/proposals/render');

let logo: Promise<Uint8Array> | null = null;
function logoBytes(): Promise<Uint8Array> {
  logo ??= fetch(logoPngUrl)
    .then((r) => (r.ok ? r.arrayBuffer() : new ArrayBuffer(0)))
    .then((b) => new Uint8Array(b))
    .catch(() => new Uint8Array(0));
  return logo;
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function optionalBytes(
  supabase: Supabase,
  path: string | null | undefined,
): Promise<Uint8Array | undefined> {
  if (!path) return undefined;
  try {
    return await downloadBytes(supabase, path);
  } catch {
    return undefined;
  }
}

/** Builds and renders the completed proposal form. */
export async function renderProposal(
  kind: 'pdf' | 'docx',
  supabase: Supabase,
  proposal: ProposalRow,
  files: readonly ProposalFileRow[],
): Promise<{ bytes: Uint8Array; name: string; type: string }> {
  const def = formById(proposal.form_id);
  if (!def) throw new Error(`The form “${proposal.form_id}” is not available in this version of the portal.`);
  const [r, logoPng, sigPng] = await Promise.all([
    loadRender(),
    logoBytes(),
    optionalBytes(supabase, proposal.signature?.imagePath),
  ]);
  const confirmLabels = new Map<string, string>([
    ...GLOBAL_CONFIRMATIONS.map((c) => [c.id, c.label] as [string, string]),
    ...def.declaration.confirmations.map((c) => [c.id, c.label] as [string, string]),
  ]);
  const sig = proposal.signature;
  const model = r.buildProposalDocument(def, (proposal.answers ?? {}) as Answers, {
    proposalNo: proposal.proposal_no,
    productName: productByCode(proposal.product_code)?.name ?? proposal.product_code,
    ...(proposal.submitted_at ? { submittedAt: proposal.submitted_at } : {}),
    customerNo: proposal.customer_no ?? '',
    phone: proposal.customer_phone ?? '',
    ...(sig?.signedName
      ? {
          signature: {
            method: (sig.method as 'drawn' | 'typed' | 'uploaded' | undefined) ?? 'drawn',
            signedName: sig.signedName,
            signedAt: sig.signedAt ?? proposal.submitted_at ?? '',
            ...(sigPng ? { imagePng: toBase64(sigPng) } : {}),
          },
        }
      : {}),
    confirmations: (proposal.confirmations ?? []).map((id) => ({ id, label: confirmLabels.get(id) ?? id })),
    files: files.map((f) => ({
      kind: f.kind,
      name: f.original_name ?? f.kind,
      size: f.size,
      createdAt: f.created_at,
    })),
    ...(sig?.ip ? { ip: sig.ip } : {}),
    ...(sig?.userAgent ? { userAgent: sig.userAgent } : {}),
    ...(sig?.answersSha256 ? { answersSha256: sig.answersSha256 } : {}),
    status: proposal.status,
  });
  const bytes =
    kind === 'pdf'
      ? await r.renderProposalPdf(model, { logoPng })
      : await r.renderProposalDocx(model, { logoPng });
  return {
    bytes,
    name: `${proposal.proposal_no} proposal form.${kind}`,
    type:
      kind === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
}

/**
 * The certificate as issued: the stored snapshot (never rebuilt from today's settings), with the
 * signature image uploaded in Products & rates, if any.
 */
export async function renderCertificate(
  supabase: Supabase,
  cert: CertificateData,
  signaturePath: string | null | undefined,
): Promise<Uint8Array> {
  const [r, logoPng, signaturePng] = await Promise.all([
    loadRender(),
    logoBytes(),
    optionalBytes(supabase, signaturePath),
  ]);
  return r.renderCertificatePdf(cert, { logoPng, ...(signaturePng ? { signaturePng } : {}) });
}
