// PDF downloads. The renderers (pdf-lib) are large, so they load only when a customer downloads.
import logoPngUrl from '@serene/ui/assets/serene-logo.png';
import {
  GLOBAL_CONFIRMATIONS,
  type Answers,
  type FormDefinition,
  type PolicyDetail,
  type ProposalFile,
  type SignatureInfo,
} from '@serene/proposals';
import { MOCK } from '../api/client';

let logoBytes: Promise<Uint8Array> | null = null;
function logo(): Promise<Uint8Array> {
  logoBytes ??= fetch(logoPngUrl)
    .then((r) => {
      if (!r.ok) throw new Error('logo');
      return r.arrayBuffer();
    })
    .then((b) => new Uint8Array(b));
  return logoBytes;
}

export function saveBytes(bytes: Uint8Array, filename: string, mime = 'application/pdf'): void {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const safeName = (s: string) => s.replace(/[^A-Za-z0-9-]+/g, '-');

/** The signatory's signature image recorded at issue, or undefined (404 = none: dotted line only). */
async function signatureBytes(url: string | undefined): Promise<Uint8Array | undefined> {
  if (!url || MOCK) return undefined;
  try {
    const r = await fetch(url, { credentials: 'same-origin' });
    if (!r.ok) return undefined;
    return new Uint8Array(await r.arrayBuffer());
  } catch {
    return undefined;
  }
}

export async function downloadCertificate(
  policy: Pick<PolicyDetail, 'certificate' | 'signatureUrl'>,
): Promise<void> {
  const cert = policy.certificate;
  const [{ renderCertificatePdf }, logoPng, signaturePng] = await Promise.all([
    import('@serene/proposals/render'),
    logo(),
    signatureBytes(policy.signatureUrl),
  ]);
  const bytes = await renderCertificatePdf(cert, signaturePng ? { logoPng, signaturePng } : { logoPng });
  saveBytes(bytes, `Serene-certificate-${safeName(cert.certificateNo)}.pdf`);
}

/** Shape of GET /proposals/:id/document (api.ts: { form, answers, files, signature, meta }). */
export interface ProposalDocumentResponse {
  form: FormDefinition;
  answers: Answers;
  files?: readonly ProposalFile[];
  signature?: SignatureInfo;
  meta?: Record<string, unknown>;
}

export async function downloadProposal(
  doc: ProposalDocumentResponse,
  fallback: { proposalNo: string; productName: string; status: string; phone: string; customerNo: string },
): Promise<void> {
  const [{ buildProposalDocument, renderProposalPdf }, logoPng] = await Promise.all([
    import('@serene/proposals/render'),
    logo(),
  ]);
  const meta = doc.meta ?? {};
  // The server's proposal number wins: the page's fallback may still be the policy number.
  const proposalNo = String(meta.proposalNo ?? fallback.proposalNo);
  const files = (doc.files ?? []).map((f) => ({
    kind: f.kind,
    name: f.name,
    size: f.size,
    createdAt: f.createdAt,
  }));
  const model = buildProposalDocument(doc.form, doc.answers, {
    proposalNo,
    productName: String(meta.productName ?? fallback.productName),
    customerNo: String(meta.customerNo ?? fallback.customerNo),
    phone: String(meta.phone ?? fallback.phone),
    status: String(meta.status ?? fallback.status),
    // Every confirmation is required to submit, so a signed proposal ticked them all.
    confirmations: Array.isArray(meta.confirmations)
      ? (meta.confirmations as { id: string; label: string }[])
      : doc.signature
        ? [...doc.form.declaration.confirmations, ...GLOBAL_CONFIRMATIONS]
        : [],
    files: Array.isArray(meta.files) ? (meta.files as typeof files) : files,
    ...(typeof meta.submittedAt === 'string' ? { submittedAt: meta.submittedAt } : {}),
    ...(doc.signature ? { signature: doc.signature } : {}),
    ...(typeof meta.ip === 'string' ? { ip: meta.ip } : {}),
    ...(typeof meta.userAgent === 'string' ? { userAgent: meta.userAgent } : {}),
    ...(typeof meta.answersSha256 === 'string' ? { answersSha256: meta.answersSha256 } : {}),
  });
  const bytes = await renderProposalPdf(model, { logoPng });
  saveBytes(bytes, `Serene-proposal-${safeName(proposalNo)}.pdf`);
}
