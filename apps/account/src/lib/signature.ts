// Signature capture: pure geometry and pixel helpers (tested), plus canvas rendering for the
// three methods (draw, type, upload). Output: a cropped, transparent PNG ≤ 300 KB, base64.

export interface Point {
  x: number;
  y: number;
}
export type Stroke = readonly Point[];

export const MAX_SIGNATURE_BYTES = 300 * 1024;
export const SIGNATURE_MAX_W = 900;
export const SIGNATURE_MAX_H = 300;
const INK = '#0b1240';

/**
 * Smooth path commands for a stroke: straight to the first midpoint, then quadratic curves through
 * each sample using the next midpoint as the end point (the classic "midpoint smoothing").
 */
export type PathCmd =
  | { op: 'M'; x: number; y: number }
  | { op: 'L'; x: number; y: number }
  | { op: 'Q'; cx: number; cy: number; x: number; y: number }
  | { op: 'DOT'; x: number; y: number };

export function smoothPath(stroke: Stroke): PathCmd[] {
  const first = stroke[0];
  if (!first) return [];
  if (stroke.length === 1) return [{ op: 'DOT', x: first.x, y: first.y }];
  if (stroke.length === 2) {
    const b = stroke[1] as Point;
    return [
      { op: 'M', x: first.x, y: first.y },
      { op: 'L', x: b.x, y: b.y },
    ];
  }
  const cmds: PathCmd[] = [{ op: 'M', x: first.x, y: first.y }];
  for (let i = 1; i < stroke.length - 1; i++) {
    const p = stroke[i] as Point;
    const n = stroke[i + 1] as Point;
    cmds.push({ op: 'Q', cx: p.x, cy: p.y, x: (p.x + n.x) / 2, y: (p.y + n.y) / 2 });
  }
  const last = stroke[stroke.length - 1] as Point;
  cmds.push({ op: 'L', x: last.x, y: last.y });
  return cmds;
}

/** Drops samples closer than `minDist` to the previous kept one (pointer noise). */
export function simplify(stroke: Stroke, minDist = 1.5): Point[] {
  const out: Point[] = [];
  for (const p of stroke) {
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) >= minDist) out.push(p);
  }
  const last = stroke[stroke.length - 1];
  if (last && out[out.length - 1] !== last && out.length > 0) out.push(last);
  return out;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function strokesBounds(strokes: readonly Stroke[], pad = 0): Box | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of strokes)
    for (const p of s) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  if (!Number.isFinite(minX)) return null;
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

/** Scale factor (≤ 1) that fits w×h inside maxW×maxH. */
export function fitScale(w: number, h: number, maxW: number, maxH: number): number {
  if (w <= 0 || h <= 0) return 1;
  return Math.min(1, maxW / w, maxH / h);
}

/** Total ink length: rejects a tap or a tiny scribble as a signature. */
export function inkLength(strokes: readonly Stroke[]): number {
  let total = 0;
  for (const s of strokes)
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1] as Point;
      const b = s[i] as Point;
      total += Math.hypot(b.x - a.x, b.y - a.y);
    }
  return total;
}

/** Luminance 0–255 of an RGBA pixel. */
const lum = (r: number, g: number, b: number): number => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * Otsu threshold over the luminance histogram: separates ink from paper on photos taken in uneven
 * light better than a fixed cut-off.
 */
export function otsuThreshold(rgba: ArrayLike<number>): number {
  const hist = new Array<number>(256).fill(0);
  let n = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3] ?? 255;
    if (a < 16) continue;
    const l = Math.round(lum(rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0));
    hist[l] = (hist[l] ?? 0) + 1;
    n++;
  }
  if (n === 0) return 128;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * (hist[t] ?? 0);
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t] ?? 0;
    if (wB === 0) continue;
    const wF = n - wB;
    if (wF === 0) break;
    sumB += t * (hist[t] ?? 0);
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/**
 * Turns a photo of a handwritten signature into ink on transparency: pixels darker than the
 * threshold become ink (alpha grows with darkness), the rest fully transparent. Returns the new
 * pixels and the bounding box of the ink (null when nothing is dark enough).
 */
export function thresholdToAlpha(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  threshold: number,
  ink: [number, number, number] = [11, 18, 64],
): { data: Uint8ClampedArray<ArrayBuffer>; bounds: Box | null } {
  const out = new Uint8ClampedArray(width * height * 4);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const soft = Math.max(1, threshold * 0.35);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a0 = rgba[i + 3] ?? 255;
      const l = lum(rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0);
      if (a0 < 16 || l >= threshold) continue;
      const alpha = Math.min(255, Math.round(((threshold - l) / soft) * 255));
      if (alpha < 40) continue;
      out[i] = ink[0];
      out[i + 1] = ink[1];
      out[i + 2] = ink[2];
      out[i + 3] = alpha;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  const bounds = maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  return { data: out, bounds };
}

/** Grows a box by `pad` and clamps it to the image. */
export function padBox(b: Box, pad: number, width: number, height: number): Box {
  const x = Math.max(0, b.x - pad);
  const y = Math.max(0, b.y - pad);
  return { x, y, w: Math.min(width, b.x + b.w + pad) - x, h: Math.min(height, b.y + b.h + pad) - y };
}

/** Bytes encoded by a base64 string. */
export function base64ByteLength(b64: string): number {
  const clean = b64.replace(/\s/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

export const stripDataUrl = (dataUrl: string): string => dataUrl.replace(/^data:[^;]+;base64,/, '');

// ---- Canvas rendering (browser only) -----------------------------------------------------------

export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: readonly Stroke[], width: number): void {
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of strokes) {
    const cmds = smoothPath(s);
    ctx.beginPath();
    for (const c of cmds) {
      if (c.op === 'DOT') {
        ctx.arc(c.x, c.y, width / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (c.op === 'M') ctx.moveTo(c.x, c.y);
      else if (c.op === 'L') ctx.lineTo(c.x, c.y);
      else ctx.quadraticCurveTo(c.cx, c.cy, c.x, c.y);
    }
    ctx.stroke();
  }
}

/** Encodes a canvas to PNG base64, shrinking until it fits the size limit. */
function toPngWithinLimit(source: HTMLCanvasElement): string {
  let canvas = source;
  for (let attempt = 0; attempt < 6; attempt++) {
    const b64 = stripDataUrl(canvas.toDataURL('image/png'));
    if (base64ByteLength(b64) <= MAX_SIGNATURE_BYTES) return b64;
    const next = document.createElement('canvas');
    next.width = Math.max(1, Math.round(canvas.width * 0.75));
    next.height = Math.max(1, Math.round(canvas.height * 0.75));
    next.getContext('2d')?.drawImage(canvas, 0, 0, next.width, next.height);
    canvas = next;
  }
  throw new Error('The signature image is too large.');
}

/** Renders drawn strokes (CSS-pixel coordinates) to a cropped transparent PNG. */
export function strokesToPng(strokes: readonly Stroke[], lineWidth = 2.6): string {
  const box = strokesBounds(strokes, lineWidth * 2 + 6);
  if (!box) throw new Error('Nothing drawn');
  // Up to 3× the on-screen size for a crisp document, never beyond 900 × 300.
  const s = Math.min(3, SIGNATURE_MAX_W / box.w, SIGNATURE_MAX_H / box.h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(box.w * s));
  canvas.height = Math.max(1, Math.round(box.h * s));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  ctx.scale(s, s);
  ctx.translate(-box.x, -box.y);
  drawStrokes(ctx, strokes, lineWidth);
  return toPngWithinLimit(canvas);
}

/** Script-like fonts available on most systems, ending in the generic `cursive` family. */
export const SIGNATURE_FONT = `'Segoe Script', 'Brush Script MT', 'Snell Roundhand', 'Apple Chancery', 'URW Chancery L', 'Dancing Script', cursive`;

export function drawTypedSignature(ctx: CanvasRenderingContext2D, name: string, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  let size = Math.round(h * 0.5);
  ctx.font = `italic ${size}px ${SIGNATURE_FONT}`;
  while (size > 14 && ctx.measureText(name).width > w * 0.9) {
    size -= 2;
    ctx.font = `italic ${size}px ${SIGNATURE_FONT}`;
  }
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, w / 2, h / 2);
}

export function typedToPng(name: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = SIGNATURE_MAX_W;
  canvas.height = 260;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  drawTypedSignature(ctx, name.trim(), canvas.width, canvas.height);
  return cropCanvas(canvas, 12);
}

/** Crops a canvas to its non-transparent pixels (plus padding) and encodes it. */
function cropCanvas(canvas: HTMLCanvasElement, pad: number): string {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if ((data[(y * width + x) * 4 + 3] ?? 0) > 8) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
  if (maxX < 0) throw new Error('Nothing to sign with');
  const box = padBox({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }, pad, width, height);
  const out = document.createElement('canvas');
  out.width = box.w;
  out.height = box.h;
  out.getContext('2d')?.drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  return toPngWithinLimit(out);
}

/**
 * Photo of a handwritten signature → cropped transparent PNG. Returns base64 and a data URL for
 * the preview. Throws when no ink can be found.
 */
export async function uploadedToPng(file: Blob): Promise<{ b64: string; preview: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = fitScale(bitmap.width, bitmap.height, 1600, 1600);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas not available');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const img = ctx.getImageData(0, 0, w, h);
  // Ink is darker than the paper; never accept a threshold so high that grey paper becomes ink.
  const t = Math.min(otsuThreshold(img.data), 170);
  const { data, bounds } = thresholdToAlpha(img.data, w, h, t);
  if (!bounds || bounds.w * bounds.h < 200) throw new Error('No signature found in the photo');
  const box = padBox(bounds, 10, w, h);
  const ink = new ImageData(new Uint8ClampedArray(data), w, h);
  const full = document.createElement('canvas');
  full.width = w;
  full.height = h;
  full.getContext('2d')?.putImageData(ink, 0, 0);
  const s = fitScale(box.w, box.h, SIGNATURE_MAX_W, SIGNATURE_MAX_H);
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(box.w * s));
  out.height = Math.max(1, Math.round(box.h * s));
  out.getContext('2d')?.drawImage(full, box.x, box.y, box.w, box.h, 0, 0, out.width, out.height);
  const b64 = toPngWithinLimit(out);
  return { b64, preview: `data:image/png;base64,${b64}` };
}
