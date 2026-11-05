// PDF page layout for a ReportModel as plain draw operations. The pdf-lib adapter (pdf.ts) only
// executes them, so pagination, wrapping and truncation are testable without a PDF library.
// Text is always drawn as text, never interpreted (SPEC FILES).
import { cellText } from '../../export/lib/escape.ts';
import type { ReportModel, Table } from './model.ts';

export type Measure = (text: string, size: number, bold: boolean) => number;
export type Op =
  | {
      kind: 'text';
      page: number;
      x: number;
      y: number;
      size: number;
      bold: boolean;
      text: string;
      muted?: boolean;
    }
  | {
      kind: 'rect';
      page: number;
      x: number;
      y: number;
      w: number;
      h: number;
      fill: 'brand' | 'subtle' | 'border';
    };

export const PAGE = { width: 595.28, height: 841.89, margin: 48, headerHeight: 64, footerHeight: 40 };

/** Standard PDF fonts use WinAnsi (cp1252). Map common extra letters, strip accents, replace the rest. */
const CP1252_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const FOLD: Record<string, string> = {
  ɛ: 'e',
  Ɛ: 'E',
  ɔ: 'o',
  Ɔ: 'O',
  ŋ: 'ng',
  Ŋ: 'Ng',
  '−': '-',
  '→': '->',
  '≤': '<=',
  '≥': '>=',
};
export function toWinAnsi(text: string): string {
  let out = '';
  for (const ch of text.replace(/[\r\n\t]+/g, ' ')) {
    const code = ch.codePointAt(0)!;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || CP1252_EXTRA.has(ch)) {
      out += ch;
    } else if (FOLD[ch]) {
      out += FOLD[ch];
    } else {
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      out += base && base.codePointAt(0)! <= 0xff && base.codePointAt(0)! >= 0x20 ? base : '?';
    }
  }
  return out;
}

/** Greedy word wrap to a width; a single word longer than the width is cut. */
export function wrap(text: string, width: number, size: number, bold: boolean, measure: Measure): string[] {
  const words = toWinAnsi(text).split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate, size, bold) <= width) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = measure(word, size, bold) <= width ? word : truncate(word, width, size, bold, measure);
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/** Shortens text with an ellipsis so it fits the width. */
export function truncate(text: string, width: number, size: number, bold: boolean, measure: Measure): string {
  const t = toWinAnsi(text);
  if (measure(t, size, bold) <= width) return t;
  let lo = 0;
  let hi = t.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(t.slice(0, mid) + '…', size, bold) <= width) lo = mid;
    else hi = mid - 1;
  }
  return t.slice(0, lo) + '…';
}

export interface Layout {
  ops: Op[];
  pages: number;
}

export function layoutReport(model: ReportModel, measure: Measure): Layout {
  const ops: Op[] = [];
  const left = PAGE.margin;
  const contentWidth = PAGE.width - 2 * PAGE.margin;
  const top = PAGE.height - PAGE.margin - PAGE.headerHeight;
  const bottom = PAGE.margin + PAGE.footerHeight;
  let page = 0;
  let y = top;

  const newPage = () => {
    page++;
    y = top;
  };
  const ensure = (h: number) => {
    if (y - h < bottom) newPage();
  };
  const text = (t: string, x: number, size: number, bold = false, muted = false) =>
    ops.push({ kind: 'text', page, x, y, size, bold, text: toWinAnsi(t), muted });
  const para = (t: string, size: number, bold = false, muted = false, gap = 4) => {
    for (const line of wrap(t, contentWidth, size, bold, measure)) {
      ensure(size + gap);
      y -= size + gap;
      text(line, left, size, bold, muted);
    }
  };

  newPage();
  para(model.title, 20, true);
  para(model.subtitle, 11, false, true);
  if (model.demo)
    para('Demo data: not real customer feedback. This file was generated outside production.', 10, true);
  y -= 8;

  const labelW = 150;
  for (const [label, value] of model.meta) {
    const lines = wrap(value, contentWidth - labelW, 9, false, measure);
    ensure(lines.length * 13);
    y -= 13;
    text(label, left, 9, true);
    lines.forEach((line, i) => {
      if (i > 0) y -= 13;
      ops.push({ kind: 'text', page, x: left + labelW, y, size: 9, bold: false, text: line });
    });
  }
  y -= 12;

  // KPI cards: three per row.
  const cardW = (contentWidth - 16) / 3;
  const cardH = 62;
  model.kpis.forEach((k, i) => {
    const col = i % 3;
    if (col === 0) {
      ensure(cardH + 10);
      y -= cardH + 10;
    }
    const x = left + col * (cardW + 8);
    ops.push({ kind: 'rect', page, x, y, w: cardW, h: cardH, fill: 'subtle' });
    ops.push({
      kind: 'text',
      page,
      x: x + 8,
      y: y + cardH - 16,
      size: 8,
      bold: false,
      muted: true,
      text: truncate(k.label, cardW - 16, 8, false, measure),
    });
    ops.push({
      kind: 'text',
      page,
      x: x + 8,
      y: y + cardH - 38,
      size: 18,
      bold: true,
      text: truncate(k.value, cardW - 16, 18, true, measure),
    });
    ops.push({
      kind: 'text',
      page,
      x: x + 8,
      y: y + 8,
      size: 7,
      bold: false,
      muted: true,
      text: truncate(k.detail, cardW - 16, 7, false, measure),
    });
  });
  y -= 18;

  for (const table of model.tables) drawTable(table);

  y -= 6;
  for (const n of model.notes) para(n, 8, false, true, 3);

  function drawTable(table: Table) {
    const rowH = 15;
    const widths = columnWidths(table, contentWidth);
    const header = () => {
      ensure(rowH);
      y -= rowH;
      ops.push({ kind: 'rect', page, x: left, y: y - 4, w: contentWidth, h: rowH, fill: 'brand' });
      let x = left + 4;
      table.columns.forEach((c, i) => {
        ops.push({
          kind: 'text',
          page,
          x,
          y,
          size: 8,
          bold: true,
          text: truncate(c.label, widths[i]! - 8, 8, true, measure),
        });
        x += widths[i]!;
      });
    };
    ensure(16 + rowH * 2);
    y -= 16;
    text(table.title, left, 12, true);
    header();
    if (table.rows.length === 0) {
      y -= rowH;
      text(table.note ?? 'No data for this period.', left + 4, 8, false, true);
      y -= 6;
      return;
    }
    table.rows.forEach((row, r) => {
      if (y - rowH < bottom) {
        newPage();
        header();
      }
      y -= rowH;
      if (r % 2 === 1)
        ops.push({ kind: 'rect', page, x: left, y: y - 4, w: contentWidth, h: rowH, fill: 'subtle' });
      let x = left + 4;
      table.columns.forEach((c, i) => {
        const v = row[i];
        const s =
          c.type === 'boolean'
            ? v
              ? 'Yes'
              : ''
            : v === null || v === undefined
              ? 'No data'
              : cellText(v).replace(/^'/, '');
        ops.push({
          kind: 'text',
          page,
          x,
          y,
          size: 8,
          bold: false,
          text: truncate(s, widths[i]! - 8, 8, false, measure),
        });
        x += widths[i]!;
      });
    });
    if (table.note) {
      y -= 12;
      ensure(10);
      text(table.note, left, 7, false, true);
    }
    y -= 8;
  }

  // Footers: legal line and page numbers on every page.
  for (let p = 1; p <= page; p++) {
    ops.push({
      kind: 'text',
      page: p,
      x: left,
      y: PAGE.margin - 16,
      size: 8,
      bold: false,
      muted: true,
      text: toWinAnsi(model.footer),
    });
    const label = `Page ${p} of ${page}`;
    ops.push({
      kind: 'text',
      page: p,
      x: PAGE.width - PAGE.margin - measure(label, 8, false),
      y: PAGE.margin - 16,
      size: 8,
      bold: false,
      muted: true,
      text: label,
    });
  }
  return { ops, pages: page };
}

/** First column (labels) gets the slack; numeric columns are narrow. */
export function columnWidths(table: Table, total: number): number[] {
  const weights = table.columns.map((c, i) => (i === 0 ? 3 : c.type === 'text' ? 2.2 : 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (w / sum) * total);
}
