import { describe, expect, it } from 'vitest';
import {
  base64ByteLength,
  fitScale,
  inkLength,
  otsuThreshold,
  padBox,
  simplify,
  smoothPath,
  strokesBounds,
  stripDataUrl,
  thresholdToAlpha,
} from './signature';

describe('stroke geometry', () => {
  it('smooths a stroke with quadratic curves through midpoints', () => {
    const cmds = smoothPath([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 10 },
      { x: 30, y: 10 },
    ]);
    expect(cmds[0]).toEqual({ op: 'M', x: 0, y: 0 });
    expect(cmds[1]).toEqual({ op: 'Q', cx: 10, cy: 0, x: 15, y: 5 });
    expect(cmds[2]).toEqual({ op: 'Q', cx: 20, cy: 10, x: 25, y: 10 });
    expect(cmds[3]).toEqual({ op: 'L', x: 30, y: 10 });
  });
  it('turns a tap into a dot and two points into a line', () => {
    expect(smoothPath([{ x: 1, y: 2 }])).toEqual([{ op: 'DOT', x: 1, y: 2 }]);
    expect(smoothPath([]).length).toBe(0);
    expect(
      smoothPath([
        { x: 0, y: 0 },
        { x: 5, y: 5 },
      ]).map((c) => c.op),
    ).toEqual(['M', 'L']);
  });
  it('drops pointer noise but keeps the end point', () => {
    const s = simplify([
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
      { x: 3, y: 0 },
      { x: 3.2, y: 0 },
    ]);
    expect(s).toEqual([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3.2, y: 0 },
    ]);
  });
  it('measures bounds and ink', () => {
    const strokes = [
      [
        { x: 10, y: 20 },
        { x: 40, y: 60 },
      ],
      [{ x: 5, y: 30 }],
    ];
    expect(strokesBounds(strokes, 2)).toEqual({ x: 3, y: 18, w: 39, h: 44 });
    expect(strokesBounds([])).toBeNull();
    expect(inkLength(strokes)).toBe(50);
  });
  it('fits within the PNG limits without upscaling', () => {
    expect(fitScale(1800, 300, 900, 300)).toBe(0.5);
    expect(fitScale(100, 50, 900, 300)).toBe(1);
  });
});

/** Builds an RGBA image: white paper with a dark rectangle of "ink". */
function paperWithInk(
  w: number,
  h: number,
  ink: { x: number; y: number; w: number; h: number },
  paper = 240,
  dark = 30,
) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inside = x >= ink.x && x < ink.x + ink.w && y >= ink.y && y < ink.y + ink.h;
      const v = inside ? dark : paper;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  return data;
}

describe('uploaded signature processing', () => {
  it('finds a threshold between paper and ink', () => {
    const img = paperWithInk(40, 20, { x: 5, y: 5, w: 20, h: 4 });
    const t = otsuThreshold(img);
    expect(t).toBeGreaterThanOrEqual(30);
    expect(t).toBeLessThan(240);
  });
  it('makes paper transparent, keeps ink and crops to it', () => {
    const img = paperWithInk(40, 20, { x: 5, y: 6, w: 20, h: 4 });
    const { data, bounds } = thresholdToAlpha(img, 40, 20, 135);
    expect(bounds).toEqual({ x: 5, y: 6, w: 20, h: 4 });
    expect(data[3]).toBe(0); // corner pixel: paper → transparent
    const inkPixel = (7 * 40 + 10) * 4;
    expect(data[inkPixel + 3]).toBe(255);
    expect(padBox(bounds!, 10, 40, 20)).toEqual({ x: 0, y: 0, w: 35, h: 20 });
  });
  it('reports no ink on a blank page', () => {
    const img = paperWithInk(10, 10, { x: 0, y: 0, w: 0, h: 0 });
    expect(thresholdToAlpha(img, 10, 10, 128).bounds).toBeNull();
  });
});

describe('PNG size limit helpers', () => {
  it('measures decoded base64 length', () => {
    expect(base64ByteLength('TWFu')).toBe(3);
    expect(base64ByteLength('TWE=')).toBe(2);
    expect(base64ByteLength('TQ==')).toBe(1);
    expect(stripDataUrl('data:image/png;base64,AAAA')).toBe('AAAA');
  });
});
