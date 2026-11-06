// Certificate of insurance as PDF: an A4 copy of Serene's motor certificate layout, also used
// (with general items) for every other product.
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import type { CertificateData } from '../schema';
import { winAnsi } from './format';
import { A4, BLACK, centred, dots, GREY, NAVY, text, widthOf, wrap } from './pdf-common';
import type { RenderAssets } from './proposal-pdf';

const YELLOW = rgb(0.961, 0.831, 0);
const SIZE = 8.5;

// Frame geometry
const OUTER = { x: 60, right: 566, bottom: 34 } as const;
const IN = { x: OUTER.x + 5, right: OUTER.right - 5 } as const;
const PAD = 12;
const CX0 = IN.x + PAD; // content left
const CX1 = IN.right - PAD; // content right
const VALUE_X = 320;

function drawQr(page: PDFPage, url: string, x: number, y: number, size: number): void {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const quiet = 1;
  const cell = size / (n + quiet * 2);
  page.drawRectangle({ x, y, width: size, height: size, color: rgb(1, 1, 1) });
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.modules.data[r * n + c]) continue;
      page.drawRectangle({
        x: x + (c + quiet) * cell,
        y: y + size - (r + quiet + 1) * cell,
        width: cell + 0.05,
        height: cell + 0.05,
        color: BLACK,
      });
    }
  }
}

function spine(page: PDFPage, font: PDFFont): void {
  const margin = 26;
  page.drawRectangle({ x: 24, y: margin, width: 7, height: A4.height - 2 * margin, color: YELLOW });
  const letters = 'SERENE INSURANCE'.split('');
  const size = 28;
  const top = A4.height - margin - size * 0.72;
  const bottom = margin;
  const step = (top - bottom) / (letters.length - 1);
  letters.forEach((ch, i) => {
    if (ch === ' ') return;
    const w = font.widthOfTextAtSize(ch, size);
    text(page, ch, 45 - w / 2, top - i * step, font, size, rgb(0.86, 0.86, 0.86));
  });
}

export async function renderCertificatePdf(cert: CertificateData, assets: RenderAssets): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(winAnsi(`Certificate of insurance ${cert.certificateNo}`));
  doc.setAuthor('Serene Insurance Ghana Ltd');
  doc.setSubject(winAnsi(`${cert.coverTitle} - policy ${cert.policyNo}`));
  doc.setCreator('Serene online sales');
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([A4.width, A4.height]);

  let logo: PDFImage | null = null;
  try {
    logo = assets.logoPng.length ? await doc.embedPng(assets.logoPng) : null;
  } catch {
    logo = null;
  }
  let signature: PDFImage | null = null;
  try {
    signature = assets.signaturePng?.length ? await doc.embedPng(assets.signaturePng) : null;
  } catch {
    signature = null;
  }

  spine(page, reg);

  // Header: logo, company name to its right, act line, big title.
  let y = A4.height - 34;
  if (logo) {
    const w = 96;
    const h = (logo.height / logo.width) * w;
    page.drawImage(logo, { x: OUTER.x + 6, y: y - h, width: w, height: h });
    text(page, 'SERENE INSURANCE GHANA LTD', OUTER.x + w + 24, y - h / 2 - 12.5 * 0.36, bold, 12.5, BLACK);
    y -= h + 16;
  } else {
    text(page, 'SERENE INSURANCE GHANA LTD', OUTER.x + 6, y - 20, bold, 12.5, BLACK);
    y -= 46;
  }
  const mid = (OUTER.x + OUTER.right) / 2;
  for (const line of wrap(reg, cert.actLine, 15, OUTER.right - OUTER.x - 10)) {
    centred(page, line, y, reg, 15, BLACK, mid);
    y -= 18;
  }
  y -= 14;
  centred(page, 'CERTIFICATE OF INSURANCE', y, bold, 25, BLACK, mid);
  y -= 16;

  const outerTop = y;
  const innerTop = outerTop - 5;
  y = innerTop - 18;

  // Inside the inner box.
  centred(page, cert.coverTitle, y, bold, 11, BLACK, mid);
  y -= 20;
  text(page, `CERTIFICATE NO: ${cert.certificateNo}`, CX0, y, bold, SIZE);
  const pol = `POLICY NO: ${cert.policyNo}`;
  text(page, pol, CX1 - widthOf(bold, pol, SIZE), y, bold, SIZE);
  y -= 13;
  const cust = `CUSTOMER NO: ${cert.customerNo}`;
  text(page, cust, CX1 - widthOf(bold, cust, SIZE), y, bold, SIZE);
  y -= 20;

  const lead = SIZE * 1.38;
  const labelW = VALUE_X - CX0 - 14;
  const valueW = CX1 - VALUE_X;

  const item = (label: string, value: string | undefined) => {
    const ll = wrap(bold, label, SIZE, value ? labelW : CX1 - CX0);
    const vl = value ? wrap(bold, value, SIZE, valueW) : [];
    const rows = Math.max(ll.length, vl.length);
    for (let i = 0; i < rows; i++) {
      if (ll[i]) text(page, ll[i] ?? '', CX0, y, bold, SIZE);
      if (vl[i]) text(page, vl[i] ?? '', VALUE_X, y, bold, SIZE);
      y -= lead;
    }
  };

  for (const it of cert.numberedItems) {
    item(it.label, it.value);
    y -= 5;
  }
  for (const cl of cert.clauses) {
    item(cl.label, cl.value);
    y -= 1;
    for (const line of cl.lines) {
      const ind = CX0 + 14;
      for (const l of wrap(bold, line, SIZE - 0.3, CX1 - ind)) {
        text(page, l, ind, y, bold, SIZE - 0.3);
        y -= lead - 0.6;
      }
      y -= 1.5;
    }
    y -= 5;
  }

  // Two-column facts.
  y -= 4;
  const colR = (CX0 + CX1) / 2 + 20;
  const factText = (f: { label: string; value: string }) => (f.value ? `${f.label} : ${f.value}` : f.label);
  for (let i = 0; i < cert.facts.length; i += 2) {
    const l = cert.facts[i];
    const r = cert.facts[i + 1];
    const ll = l ? wrap(bold, factText(l), SIZE, colR - CX0 - 12) : [];
    const rl = r ? wrap(bold, factText(r), SIZE, CX1 - colR) : [];
    const rows = Math.max(ll.length, rl.length);
    for (let k = 0; k < rows; k++) {
      if (ll[k]) text(page, ll[k] ?? '', CX0, y, bold, SIZE);
      if (rl[k]) text(page, rl[k] ?? '', colR, y, bold, SIZE);
      y -= lead;
    }
    y -= 6;
  }
  if (cert.footnote) {
    y -= 2;
    for (const l of wrap(bold, cert.footnote, 7.4, CX1 - CX0)) {
      text(page, l, CX0, y, bold, 7.4);
      y -= 9.6;
    }
  }
  const innerBottom = y - 6;
  page.drawRectangle({
    x: IN.x,
    y: innerBottom,
    width: IN.right - IN.x,
    height: innerTop - innerBottom,
    borderColor: NAVY,
    borderWidth: 0.8,
  });

  // Certifying statement, signature area and signatory title.
  y = innerBottom - 18;
  const paras = cert.certifyText.split('\n');
  paras.forEach((p, i) => {
    if (i > 0) y -= 6;
    for (const l of wrap(bold, p, SIZE, CX1 - CX0)) {
      text(page, l, CX0, y, bold, SIZE);
      y -= lead;
    }
  });

  const sigLineY = Math.max(y - 64, OUTER.bottom + 96);
  const sigX0 = CX1 - 190;
  const sigX1 = CX1;
  if (signature) {
    const maxW = sigX1 - sigX0 - 20;
    const maxH = 46;
    const scale = Math.min(maxW / signature.width, maxH / signature.height);
    const w = signature.width * scale;
    const h = signature.height * scale;
    page.drawImage(signature, { x: (sigX0 + sigX1) / 2 - w / 2, y: sigLineY + 2, width: w, height: h });
  }
  dots(page, sigX0, sigX1, sigLineY, BLACK);
  centred(page, cert.signatoryTitle, sigLineY - 13, bold, SIZE, BLACK, (sigX0 + sigX1) / 2);

  // QR code to the public verification page.
  const outerBottom = Math.min(OUTER.bottom, sigLineY - 40);
  if (cert.verifyUrl) {
    const q = 66;
    const qy = outerBottom + 10;
    drawQr(page, cert.verifyUrl, IN.x + 6, qy, q);
    const cx = IN.x + 6 + q + 8;
    text(page, 'Scan to check this certificate, or verify at', cx, qy + 38, bold, 6.8, GREY);
    wrap(reg, cert.verifyUrl, 6.6, sigX0 - cx - 12).forEach((l, i) =>
      text(page, l, cx, qy + 28 - i * 8.4, reg, 6.6, GREY),
    );
  }

  page.drawRectangle({
    x: OUTER.x,
    y: outerBottom,
    width: OUTER.right - OUTER.x,
    height: outerTop - outerBottom,
    borderColor: NAVY,
    borderWidth: 2.4,
  });

  return doc.save();
}
