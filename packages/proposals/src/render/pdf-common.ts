// Drawing helpers shared by the proposal and certificate PDFs (pdf-lib, standard fonts).
import { LineCapStyle, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { winAnsi } from './format';

export const A4 = { width: 595.28, height: 841.89 } as const;

export const INK: RGB = rgb(0.06, 0.16, 0.52); // the "filled in" answers
export const BLACK: RGB = rgb(0, 0, 0);
export const GREY: RGB = rgb(0.38, 0.38, 0.38);
export const LIGHT: RGB = rgb(0.72, 0.72, 0.72);
export const NAVY: RGB = rgb(0.09, 0.13, 0.42);

/** Width of sanitised text. */
export const widthOf = (font: PDFFont, text: string, size: number): number =>
  font.widthOfTextAtSize(winAnsi(text), size);

/** Word-wraps text (respecting newlines) to lines no wider than `width`; long words are split. */
export function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const out: string[] = [];
  const safe = winAnsi(text);
  for (const para of safe.split('\n')) {
    const words = para.split(/ +/).filter((w) => w !== '');
    if (words.length === 0) {
      out.push('');
      continue;
    }
    let line = '';
    for (let word of words) {
      // Split words that are wider than a whole line (hashes, URLs, user agents).
      while (font.widthOfTextAtSize(word, size) > width) {
        let cut = word.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(word.slice(0, cut), size) > width) cut--;
        if (line) {
          out.push(line);
          line = '';
        }
        out.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) line = candidate;
      else {
        if (line) out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

export function text(
  page: PDFPage,
  s: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color: RGB = BLACK,
): void {
  const safe = winAnsi(s);
  if (!safe) return;
  page.drawText(safe, { x, y, font, size, color });
}

export function centred(
  page: PDFPage,
  s: string,
  y: number,
  font: PDFFont,
  size: number,
  color: RGB = BLACK,
  cx = A4.width / 2,
): void {
  text(page, s, cx - widthOf(font, s, size) / 2, y, font, size, color);
}

/** Dotted leader line like the paper forms' "………". */
export function dots(page: PDFPage, x1: number, x2: number, y: number, color: RGB = GREY): void {
  if (x2 - x1 < 2) return;
  page.drawLine({
    start: { x: x1, y },
    end: { x: x2, y },
    thickness: 0.75,
    color,
    dashArray: [0.01, 2.1],
    lineCap: LineCapStyle.Round,
  });
}

/** Tick box; `ticked` draws a hand-style tick in ink. (x, y) = bottom-left. */
export function tickBox(page: PDFPage, x: number, y: number, ticked: boolean, size = 8.5): void {
  page.drawRectangle({ x, y, width: size, height: size, borderColor: BLACK, borderWidth: 0.7 });
  if (!ticked) return;
  const s = size / 8.5;
  page.drawLine({
    start: { x: x + 1.6 * s, y: y + 4.6 * s },
    end: { x: x + 3.6 * s, y: y + 1.8 * s },
    thickness: 1.4,
    color: INK,
    lineCap: LineCapStyle.Round,
  });
  page.drawLine({
    start: { x: x + 3.6 * s, y: y + 1.8 * s },
    end: { x: x + 8.6 * s, y: y + 9.6 * s },
    thickness: 1.4,
    color: INK,
    lineCap: LineCapStyle.Round,
  });
}

/** Ring drawn around a printed word (the chosen YES / NO). */
export function ring(page: PDFPage, x: number, y: number, w: number, size: number): void {
  page.drawEllipse({
    x: x + w / 2,
    y: y + size * 0.35,
    xScale: w / 2 + 4.5,
    yScale: size * 0.75,
    borderColor: INK,
    borderWidth: 1.1,
  });
}
