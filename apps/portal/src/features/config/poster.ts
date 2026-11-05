// QR poster (M05, A-130): A4 / A5 PDF built in the browser with pdf-lib. Layout maths are pure and
// unit-tested; the builder only draws what the layout says. The poster never names a branch (Rule 2).
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import { QUIET_ZONE, qrMatrix, qrRuns } from './qr';

export type PosterSize = 'A4' | 'A5';

export const MM = 72 / 25.4;
/** The SPEC minimum printed QR size (3 cm), excluding the quiet zone. */
export const MIN_QR_PT = 30 * MM;

const PAGE: Record<PosterSize, { w: number; h: number }> = {
  A4: { w: 210 * MM, h: 297 * MM },
  A5: { w: 148 * MM, h: 210 * MM },
};

export const HEADLINE = 'How did we do?';
export const SUBHEADLINE = 'Tell us in under a minute';
export const PRIVACY_NOTE =
  'Your answers are anonymous unless you choose to be contacted. The privacy notice is in the survey.';

export interface Box {
  x: number;
  /** Distance from the top of the page to the top of the box. */
  top: number;
  w: number;
  h: number;
}

export interface PosterLayout {
  size: PosterSize;
  page: { w: number; h: number };
  margin: number;
  band: Box;
  logo: Box;
  headline: { top: number; size: number };
  subheadline: { top: number; size: number };
  /** The QR symbol including its quiet zone. */
  qr: Box & { module: number; symbol: number };
  scanHint: { top: number; size: number };
  url: { top: number; size: number };
  privacy: { top: number; size: number; maxWidth: number };
  code: { top: number; size: number };
}

const LOGO_ASPECT = 864 / 1776;

/**
 * Lays out the poster top to bottom. `modules` is the QR symbol size (modules, without quiet zone).
 * Everything scales with the page; the QR symbol is at least 3 cm and as large as the space allows.
 */
export function posterLayout(size: PosterSize, modules: number): PosterLayout {
  const page = PAGE[size];
  const k = page.w / PAGE.A4.w; // 1 for A4, ~0.705 for A5
  const margin = 18 * MM * k;
  const contentW = page.w - margin * 2;
  const band: Box = { x: 0, top: 0, w: page.w, h: 6 * MM * k };
  const logoW = contentW * 0.42;
  const logo: Box = { x: (page.w - logoW) / 2, top: margin + band.h, w: logoW, h: logoW * LOGO_ASPECT };
  const headlineSize = 46 * k;
  const subSize = 26 * k;
  const headline = { top: logo.top + logo.h + 14 * MM * k, size: headlineSize };
  const subheadline = { top: headline.top + headlineSize * 1.25, size: subSize };

  const privacySize = 10 * k;
  const urlSize = 15 * k;
  const codeSize = 9 * k;
  const scanSize = 13 * k;
  // Reserve the footer: scan hint, URL, privacy (two lines), code.
  const footerH = scanSize * 1.8 + urlSize * 1.8 + privacySize * 1.4 * 2 + codeSize * 2.4;
  const qrTopLimit = subheadline.top + subSize * 1.2 + 10 * MM * k;
  const qrBottomLimit = page.h - margin - footerH - 6 * MM * k;
  const total = modules + QUIET_ZONE * 2;
  const maxSide = Math.min(contentW * 0.78, qrBottomLimit - qrTopLimit);
  const module = Math.max(maxSide / total, MIN_QR_PT / modules);
  const side = module * total;
  const qr = { x: (page.w - side) / 2, top: qrTopLimit, w: side, h: side, module, symbol: module * modules };
  const scanHint = { top: qr.top + side + 4 * MM * k, size: scanSize };
  const url = { top: scanHint.top + scanSize * 1.8, size: urlSize };
  const privacy = { top: url.top + urlSize * 2.2, size: privacySize, maxWidth: contentW };
  const code = { top: page.h - margin - codeSize, size: codeSize };
  return { size, page, margin, band, logo, headline, subheadline, qr, scanHint, url, privacy, code };
}

/** Greedy word wrap with a measuring function. */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && measure(next) > maxWidth) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Largest font size ≤ `size` at which `text` fits `maxWidth`. */
export function fitSize(
  text: string,
  size: number,
  maxWidth: number,
  widthAt: (s: number) => number,
): number {
  const w = widthAt(size);
  return w <= maxWidth ? size : (size * maxWidth) / w;
}

/** pdf-lib's standard fonts are WinAnsi; replace typographic characters they cannot encode. */
export function winAnsi(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

const BRAND = rgb(0x11 / 255, 0x08 / 255, 0xbf / 255);
const ACCENT = rgb(0xfb / 255, 0xde / 255, 0x04 / 255);
const INK = rgb(0x11 / 255, 0x11 / 255, 0x11 / 255);
const SECONDARY = rgb(0x54 / 255, 0x54 / 255, 0x54 / 255);

export interface PosterInput {
  size: PosterSize;
  url: string;
  /** Printed small at the foot so staff can tell posters apart; never a branch. */
  code?: string | undefined;
  /** PNG bytes of the Serene logo. */
  logoPng: Uint8Array | ArrayBuffer;
  companyName?: string | undefined;
}

export async function buildPosterPdf(input: PosterInput): Promise<Uint8Array> {
  const matrix = qrMatrix(input.url);
  const L = posterLayout(input.size, matrix.size);
  const doc = await PDFDocument.create();
  doc.setTitle(winAnsi(`${input.companyName ?? 'Serene Insurance'} feedback poster`));
  doc.setCreator('Serene Pulse');
  const page = doc.addPage([L.page.w, L.page.h]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const y = (top: number, h = 0) => L.page.h - top - h;
  const centred = (text: string, font: PDFFont, size: number, top: number, color = INK) => {
    const t = winAnsi(text);
    page.drawText(t, {
      x: (L.page.w - font.widthOfTextAtSize(t, size)) / 2,
      y: y(top, size * 0.8),
      size,
      font,
      color,
    });
  };

  // Thin brand band with a yellow accent line (yellow is decorative only on white, E1).
  page.drawRectangle({ x: 0, y: y(0, L.band.h), width: L.page.w, height: L.band.h, color: BRAND });
  page.drawRectangle({
    x: 0,
    y: y(L.band.h, L.band.h / 3),
    width: L.page.w,
    height: L.band.h / 3,
    color: ACCENT,
  });

  const logo = await doc.embedPng(input.logoPng);
  page.drawImage(logo, { x: L.logo.x, y: y(L.logo.top, L.logo.h), width: L.logo.w, height: L.logo.h });

  const contentW = L.page.w - L.margin * 2;
  centred(
    HEADLINE,
    bold,
    fitSize(HEADLINE, L.headline.size, contentW, (s) => bold.widthOfTextAtSize(HEADLINE, s)),
    L.headline.top,
    BRAND,
  );
  centred(SUBHEADLINE, regular, L.subheadline.size, L.subheadline.top);

  // QR: white quiet zone, then one rectangle per dark run.
  page.drawRectangle({
    x: L.qr.x,
    y: y(L.qr.top, L.qr.h),
    width: L.qr.w,
    height: L.qr.h,
    color: rgb(1, 1, 1),
  });
  const m = L.qr.module;
  for (const run of qrRuns(matrix)) {
    page.drawRectangle({
      x: L.qr.x + (run.col + QUIET_ZONE) * m,
      y: y(L.qr.top + (run.row + QUIET_ZONE) * m, m),
      width: run.len * m,
      height: m,
      color: rgb(0, 0, 0),
    });
  }

  centred('Scan with your phone camera, or type:', regular, L.scanHint.size, L.scanHint.top, SECONDARY);
  const shortUrl = winAnsi(input.url.replace(/^https?:\/\//, ''));
  const urlSize = fitSize(shortUrl, L.url.size, contentW, (s) => bold.widthOfTextAtSize(shortUrl, s));
  centred(shortUrl, bold, urlSize, L.url.top, BRAND);

  const lines = wrapText(winAnsi(PRIVACY_NOTE), L.privacy.maxWidth, (s) =>
    regular.widthOfTextAtSize(s, L.privacy.size),
  );
  lines.forEach((line, i) =>
    centred(line, regular, L.privacy.size, L.privacy.top + i * L.privacy.size * 1.4, SECONDARY),
  );

  if (input.code) centred(`Poster ${input.code}`, regular, L.code.size, L.code.top, SECONDARY);
  return doc.save();
}
