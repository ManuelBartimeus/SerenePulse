// pdf-lib adapter: executes the layout's draw operations, adds the logo header and, outside
// production, a "Demo data" watermark on every page (Rule 14).
import { degrees, PDFDocument, rgb, StandardFonts } from 'npm:pdf-lib@1.17.1';
import { layoutReport, PAGE } from './layout.ts';
import { LOGO_PNG_BASE64 } from './logo.ts';
import type { ReportModel } from './model.ts';

const BRAND = rgb(0.09, 0.32, 0.27);
const INK = rgb(0.07, 0.07, 0.07);
const MUTED = rgb(0.42, 0.42, 0.42);
const SUBTLE = rgb(0.95, 0.96, 0.95);
const WHITE = rgb(1, 1, 1);

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function renderPdf(model: ReportModel): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${model.title} – ${model.subtitle}`);
  doc.setAuthor(model.footer.replace(' · Confidential', ''));
  doc.setCreator('Serene Pulse');
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(decodeBase64(LOGO_PNG_BASE64));
  const measure = (t: string, size: number, b: boolean) => (b ? bold : regular).widthOfTextAtSize(t, size);

  const { ops, pages } = layoutReport(model, measure);
  const brandRows = new Set<string>();
  for (const op of ops)
    if (op.kind === 'rect' && op.fill === 'brand') brandRows.add(`${op.page}:${op.y + 4}`);

  const list = Array.from({ length: pages }, () => doc.addPage([PAGE.width, PAGE.height]));
  for (const p of list) {
    const h = 32;
    const w = (logo.width / logo.height) * h;
    p.drawImage(logo, { x: PAGE.margin, y: PAGE.height - PAGE.margin - h, width: w, height: h });
    p.drawLine({
      start: { x: PAGE.margin, y: PAGE.height - PAGE.margin - h - 10 },
      end: { x: PAGE.width - PAGE.margin, y: PAGE.height - PAGE.margin - h - 10 },
      thickness: 0.5,
      color: MUTED,
    });
    if (model.demo) {
      p.drawText('DEMO DATA', {
        x: 120,
        y: 260,
        size: 72,
        font: bold,
        color: rgb(0.85, 0.2, 0.2),
        opacity: 0.12,
        rotate: degrees(40),
      });
    }
  }
  for (const op of ops) {
    const p = list[op.page - 1]!;
    if (op.kind === 'rect') {
      p.drawRectangle({
        x: op.x,
        y: op.y,
        width: op.w,
        height: op.h,
        color: op.fill === 'brand' ? BRAND : SUBTLE,
      });
    } else {
      const onBrand = op.bold && brandRows.has(`${op.page}:${op.y}`);
      p.drawText(op.text, {
        x: op.x,
        y: op.y,
        size: op.size,
        font: op.bold ? bold : regular,
        color: onBrand ? WHITE : op.muted ? MUTED : INK,
      });
    }
  }
  return doc.save();
}
