// QR code helpers (M05). Error correction M (SPEC), 4-module quiet zone. Everything is built from the
// module matrix, so the on-screen code, the SVG/PNG downloads and the poster PDF are identical.
import QRCode from 'qrcode';

export interface QrMatrix {
  size: number;
  isDark: (row: number, col: number) => boolean;
}

export const QUIET_ZONE = 4;

export function qrMatrix(text: string): QrMatrix {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const m = qr.modules;
  return { size: m.size, isDark: (r, c) => m.get(r, c) === 1 };
}

/** One SVG path covering every dark module, in module units, offset by the quiet zone. */
export function qrPath(matrix: QrMatrix, offset = QUIET_ZONE): string {
  const parts: string[] = [];
  for (let r = 0; r < matrix.size; r++) {
    let c = 0;
    while (c < matrix.size) {
      if (!matrix.isDark(r, c)) {
        c++;
        continue;
      }
      const start = c;
      while (c < matrix.size && matrix.isDark(r, c)) c++;
      parts.push(`M${start + offset} ${r + offset}h${c - start}v1h${start - c}z`);
    }
  }
  return parts.join('');
}

/** Dark runs per row, used to draw the PDF version as rectangles. */
export function qrRuns(matrix: QrMatrix): { row: number; col: number; len: number }[] {
  const runs: { row: number; col: number; len: number }[] = [];
  for (let r = 0; r < matrix.size; r++) {
    let c = 0;
    while (c < matrix.size) {
      if (!matrix.isDark(r, c)) {
        c++;
        continue;
      }
      const start = c;
      while (c < matrix.size && matrix.isDark(r, c)) c++;
      runs.push({ row: r, col: start, len: c - start });
    }
  }
  return runs;
}

/** A standalone SVG file of the QR code (black on white, quiet zone included). */
export function qrSvg(text: string, title: string): string {
  const matrix = qrMatrix(text);
  const total = matrix.size + QUIET_ZONE * 2;
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total * 10}" height="${total * 10}" shape-rendering="crispEdges">`,
    `<title>${esc(title)}</title>`,
    `<rect width="${total}" height="${total}" fill="#ffffff"/>`,
    `<path fill="#000000" d="${qrPath(matrix)}"/>`,
    '</svg>',
  ].join('');
}

/** Rasterises an SVG string in the browser (for the PNG download and the poster logo). */
export async function svgToPng(svg: string, width: number, height: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('The image could not be drawn.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot draw images.');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('The image could not be saved.'))),
        'image/png',
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Saves a Blob as a file. */
export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
