// Document renderers for the online sales system (browser-only entry: @serene/proposals/render).
//
//   const model = buildProposalDocument(form, answers, meta);   // layout-neutral DocModel
//   const pdf = await renderProposalPdf(model, { logoPng });     // Uint8Array (application/pdf)
//   const docx = await renderProposalDocx(model, { logoPng });   // Uint8Array (.docx)
//   const cert = await renderCertificatePdf(certificateData, { logoPng, signaturePng });
//
// `assets` bytes are fetched by the caller (the logo from packages/ui/assets/serene-logo.png;
// the certificate signature from the setting sales_certificate_signature_path, when uploaded).
export { buildProposalDocument } from './model';
export type { Block, DocModel, LineItem, ProposalMeta } from './model';
export { renderProposalPdf } from './proposal-pdf';
export type { RenderAssets } from './proposal-pdf';
export { renderProposalDocx } from './proposal-docx';
export { renderCertificatePdf } from './certificate-pdf';
export { winAnsi, money } from './format';
