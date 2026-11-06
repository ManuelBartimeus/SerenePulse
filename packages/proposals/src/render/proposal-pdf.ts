// Completed proposal form as PDF, laid out like Serene's paper forms (A4, Helvetica).
import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { winAnsi } from './format';
import type { Block, DocModel, LineItem } from './model';
import { A4, BLACK, centred, dots, GREY, INK, LIGHT, ring, text, tickBox, widthOf, wrap } from './pdf-common';

export interface RenderAssets {
  /** Serene logo, PNG bytes. */
  logoPng: Uint8Array;
  /** Certificate only: the signatory's uploaded signature image. */
  signaturePng?: Uint8Array;
}

const M = { left: 48, right: 48, top: 36, bottom: 54 } as const;
const CW = A4.width - M.left - M.right;
const LABEL = 9.5;
const ANSWER = 10;
const SMALL = 8;
const LINE_H = 17;

export const LETTERHEAD = [
  'Head office: Fourth Floor, SU Towers, No. 18 Castle Road, Ridge - Accra',
  'P.O. Box PMB CO 90, Tema-Ghana. E-mail: info@sereneinsurance.com Tel: 0302-917444/6/7 www.sereneinsurance.com',
];

interface Fonts {
  reg: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
}

class Layout {
  page!: PDFPage;
  y = 0;
  pages: PDFPage[] = [];

  constructor(
    readonly doc: PDFDocument,
    readonly f: Fonts,
    readonly logo: PDFImage | null,
  ) {}

  /** Starts a page; continuation pages repeat a smaller logo as on the paper forms. */
  newPage(first = false): void {
    this.page = this.doc.addPage([A4.width, A4.height]);
    this.pages.push(this.page);
    this.y = A4.height - M.top;
    if (first) return;
    if (this.logo) {
      const w = 62;
      const h = (this.logo.height / this.logo.width) * w;
      this.page.drawImage(this.logo, { x: (A4.width - w) / 2, y: this.y - h, width: w, height: h });
      this.y -= h + 14;
    }
  }

  ensure(h: number): void {
    if (this.y - h < M.bottom) this.newPage();
  }

  gap(h: number): void {
    this.y -= h;
  }

  /** Wrapped paragraph; returns nothing, moves the cursor. */
  para(
    s: string,
    font: PDFFont,
    size: number,
    opts: { x?: number; width?: number; color?: typeof BLACK; lead?: number } = {},
  ): void {
    const x = opts.x ?? M.left;
    const width = opts.width ?? CW - (x - M.left);
    const lead = opts.lead ?? size * 1.32;
    for (const line of wrap(font, s, size, width)) {
      this.ensure(lead);
      this.y -= lead;
      text(this.page, line, x, this.y + lead * 0.22, font, size, opts.color ?? BLACK);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Line items ("LABEL ………… answer")

const itemLabel = (it: LineItem) => (it.number ? `${it.number} ${it.label}` : it.label);
const YES_NO_W = (f: Fonts) => widthOf(f.reg, 'YES', LABEL) + 22 + widthOf(f.reg, 'NO', LABEL);

function drawYesNo(L: Layout, x: number, baseline: number, value: 'yes' | 'no' | null | undefined): number {
  const { reg } = L.f;
  const yesW = widthOf(reg, 'YES', LABEL);
  const noW = widthOf(reg, 'NO', LABEL);
  text(L.page, 'YES', x, baseline, reg, LABEL);
  text(L.page, 'NO', x + yesW + 22, baseline, reg, LABEL);
  if (value === 'yes') ring(L.page, x, baseline, yesW, LABEL);
  if (value === 'no') ring(L.page, x + yesW + 22, baseline, noW, LABEL);
  return yesW + 22 + noW;
}

/** One item laid out in [x, x + width] on the current line (single line, answer clipped to fit). */
function drawInline(L: Layout, it: LineItem, x: number, width: number, baseline: number): void {
  const { reg } = L.f;
  const label = itemLabel(it);
  text(L.page, label, x, baseline, reg, LABEL);
  const lw = widthOf(reg, label, LABEL);
  if (it.yesno !== undefined) {
    drawYesNo(L, x + lw + 10, baseline, it.yesno);
    return;
  }
  dots(L.page, x + lw + 3, x + width, baseline - 1.2);
  if (it.value) text(L.page, it.value, x + lw + 7, baseline + 1.2, reg, ANSWER, INK);
}

/** One item over the full width, wrapping long labels and long answers onto dotted continuation lines. */
function drawFull(L: Layout, it: LineItem): void {
  const { reg } = L.f;
  const label = itemLabel(it);
  if (it.yesno !== undefined) {
    const yn = YES_NO_W(L.f);
    const lines = wrap(reg, label, LABEL, CW - yn - 14);
    lines.forEach((line, i) => {
      L.ensure(LINE_H);
      L.y -= i === 0 ? LINE_H : LABEL * 1.35;
      text(L.page, line, M.left, L.y, reg, LABEL);
      if (i === lines.length - 1) drawYesNo(L, M.left + widthOf(reg, line, LABEL) + 12, L.y, it.yesno);
    });
    L.y -= 3;
    return;
  }
  // Label lines: keep at least 90pt for the answer on the last label line.
  const labelLines = wrap(reg, label, LABEL, CW - 90);
  const valueWords = it.value ? winAnsi(it.value) : '';
  labelLines.forEach((line, i) => {
    L.ensure(LINE_H);
    L.y -= i === 0 ? LINE_H : LABEL * 1.35;
    text(L.page, line, M.left, L.y, reg, LABEL);
  });
  const last = labelLines[labelLines.length - 1] ?? '';
  let x = M.left + widthOf(reg, last, LABEL) + 3;
  // First answer chunk on the label's last line, the rest on full-width dotted lines.
  const firstWidth = M.left + CW - x - 6;
  const pieces = valueWords ? wrapAnswer(reg, valueWords, firstWidth, CW - 6) : [''];
  pieces.forEach((piece, i) => {
    if (i > 0) {
      L.ensure(LINE_H);
      L.y -= LINE_H;
      x = M.left;
    }
    dots(L.page, x, M.left + CW, L.y - 1.2);
    if (piece) text(L.page, piece, x + 4, L.y + 1.2, reg, ANSWER, INK);
  });
}

/** Wraps an answer whose first line is shorter than the following ones. */
function wrapAnswer(font: PDFFont, s: string, first: number, rest: number): string[] {
  const firstLines = wrap(font, s, ANSWER, Math.max(first, 40));
  const head = firstLines[0] ?? '';
  const remainder = s.slice(s.indexOf(head) + head.length).replace(/^\s+/, '');
  if (!remainder) return [head];
  // The first line may have consumed a whole paragraph; re-wrap the remainder at full width.
  return [head, ...wrap(font, remainder, ANSWER, rest)];
}

const ROW_GAP = 14;

function itemNeed(f: Fonts, it: LineItem): number {
  const lw = widthOf(f.reg, itemLabel(it), LABEL);
  if (it.yesno !== undefined) return lw + 10 + YES_NO_W(f);
  return lw + 10 + Math.max(widthOf(f.reg, it.value, ANSWER) + 10, 45);
}

/** Items sharing one printed line, stretched to the full width. */
function drawPacked(L: Layout, items: readonly LineItem[]): void {
  const needs = items.map((it) => itemNeed(L.f, it));
  const total = needs.reduce((a, b) => a + b, 0) + ROW_GAP * (items.length - 1);
  const extra = Math.max(0, CW - total);
  const stretchable = items.map((it, i) => (it.yesno !== undefined ? 0 : (needs[i] ?? 0)));
  const sum = stretchable.reduce((a, b) => a + b, 0) || 1;
  L.ensure(LINE_H);
  L.y -= LINE_H;
  let x = M.left;
  items.forEach((it, i) => {
    const w = (needs[i] ?? 0) + (extra * (stretchable[i] ?? 0)) / sum;
    drawInline(L, it, x, w, L.y);
    x += w + ROW_GAP;
  });
}

/**
 * A row of the paper form. Items are packed onto as few lines as fit (like "FULL NAME … AGE …");
 * an item too long for any shared line gets a full-width line of its own, wrapping as needed.
 */
function drawLine(L: Layout, items: readonly LineItem[]): void {
  let group: LineItem[] = [];
  let used = 0;
  const flush = () => {
    if (group.length === 1) drawFull(L, group[0] as LineItem);
    else if (group.length > 1) drawPacked(L, group);
    group = [];
    used = 0;
  };
  for (const it of items) {
    const need = itemNeed(L.f, it);
    const fitsAlone = need <= CW && !it.value.includes('\n');
    if (!fitsAlone) {
      flush();
      drawFull(L, it);
      continue;
    }
    const add = group.length ? need + ROW_GAP : need;
    if (used + add > CW) flush();
    group.push(it);
    used += group.length === 1 ? need : need + ROW_GAP;
  }
  flush();
  L.y -= 2;
}

// ---------------------------------------------------------------------------------------------
// Other blocks

function drawChoices(L: Layout, b: Extract<Block, { kind: 'choices' }>): void {
  const { reg } = L.f;
  const label = b.number ? `${b.number} ${b.label}` : b.label;
  const indent = M.left + 18;
  const avail = M.left + CW - indent;
  const widest = Math.max(...b.options.map((o) => widthOf(reg, o.label, LABEL)), 0);
  const cols = b.options.length >= 4 && widest + 40 < avail / 2 - 12 ? 2 : 1;
  const colW = cols === 2 ? avail / 2 - 12 : Math.min(avail, Math.max(widest + 60, 240));
  const rowsPerCol = Math.ceil(b.options.length / cols);
  const rowH = 15;
  // Keep the question with its options (up to a third of a page).
  const labelLines = wrap(reg, label, LABEL, CW).length;
  L.ensure(Math.min(labelLines * (LINE_H - 2) + (rowsPerCol + (b.other ? 1 : 0)) * rowH + 8, 260));
  L.y -= 4;
  L.para(label, reg, LABEL, { lead: LINE_H - 2 });
  for (let r = 0; r < rowsPerCol; r++) {
    L.ensure(rowH);
    L.y -= rowH;
    for (let c = 0; c < cols; c++) {
      const o = b.options[c * rowsPerCol + r];
      if (!o) continue;
      const x = indent + c * (colW + 24);
      const lines = wrap(reg, o.label, LABEL, colW - 24);
      text(L.page, lines[0] ?? '', x, L.y, reg, LABEL);
      dots(L.page, x + widthOf(reg, lines[0] ?? '', LABEL) + 3, x + colW - 14, L.y - 1);
      tickBox(L.page, x + colW - 9, L.y - 1.5, o.selected);
      if (lines.length > 1) {
        for (const extra of lines.slice(1)) {
          L.y -= LABEL * 1.3;
          text(L.page, extra, x, L.y, reg, LABEL);
        }
      }
    }
  }
  if (b.other) {
    L.ensure(rowH);
    L.y -= rowH;
    const x = indent;
    const lw = widthOf(reg, b.other.label, LABEL);
    text(L.page, b.other.label, x, L.y, reg, LABEL);
    const end = M.left + CW - 14;
    dots(L.page, x + lw + 3, end, L.y - 1);
    if (b.other.text) text(L.page, b.other.text, x + lw + 7, L.y + 1.2, reg, ANSWER, INK);
    tickBox(L.page, end + 5, L.y - 1.5, b.other.selected);
  }
  L.y -= 4;
}

function drawTable(L: Layout, b: Extract<Block, { kind: 'table' }>): void {
  const { reg, bold, boldItalic } = L.f;
  const total = b.columns.reduce((a, c) => a + c.weight, 0) || 1;
  const widths = b.columns.map((c) => (CW * c.weight) / total);
  const HEAD = b.columns.length > 7 ? 6.5 : 7.5;
  const CELL = b.columns.length > 7 ? 7.8 : 8.8;
  const headLines = b.columns.map((c, i) =>
    wrap(boldItalic, c.label.toUpperCase(), HEAD, (widths[i] ?? 20) - 6),
  );
  const headH = Math.max(...headLines.map((l) => l.length)) * (HEAD + 1.6) + 8;

  const caption = b.number ? `${b.number} ${b.label}` : b.label;
  const header = () => {
    const top = L.y;
    let x = M.left;
    L.page.drawRectangle({
      x: M.left,
      y: top - headH,
      width: CW,
      height: headH,
      color: rgb(0.95, 0.95, 0.95),
    });
    headLines.forEach((lines, i) => {
      const w = widths[i] ?? 0;
      lines.forEach((ln, k) => {
        const lw = widthOf(boldItalic, ln, HEAD);
        text(L.page, ln, x + (w - lw) / 2, top - 4 - (k + 1) * (HEAD + 1.6) + 1.5, boldItalic, HEAD);
      });
      L.page.drawRectangle({
        x,
        y: top - headH,
        width: w,
        height: headH,
        borderColor: BLACK,
        borderWidth: 0.6,
      });
      x += w;
    });
    L.y -= headH;
  };

  L.ensure(14 + headH + 20);
  L.y -= 6;
  L.para(caption, bold, SMALL + 0.5, { lead: 12 });
  L.y -= 2;
  header();
  for (const row of b.rows) {
    const cells = row.map((v, i) => wrap(reg, v, CELL, (widths[i] ?? 20) - 6));
    const h = Math.max(17, Math.max(...cells.map((c) => c.length)) * (CELL + 2) + 7);
    if (L.y - h < M.bottom) {
      L.newPage();
      header();
    }
    let x = M.left;
    cells.forEach((lines, i) => {
      const w = widths[i] ?? 0;
      lines.forEach((ln, k) => {
        if (!ln) return;
        const lw = widthOf(reg, ln, CELL);
        const tx = b.columns[i]?.numeric ? x + w - 3 - lw : x + 3;
        text(L.page, ln, tx, L.y - 4 - (k + 1) * (CELL + 2) + 2, reg, CELL, INK);
      });
      L.page.drawRectangle({ x, y: L.y - h, width: w, height: h, borderColor: BLACK, borderWidth: 0.6 });
      x += w;
    });
    L.y -= h;
  }
  L.y -= 6;
}

function drawRead(L: Layout, b: Extract<Block, { kind: 'read' }>): void {
  const { reg, bold, italic } = L.f;
  L.ensure(40);
  L.y -= 6;
  L.para(b.label.toUpperCase(), bold, SMALL + 0.5, { lead: 12 });
  for (const p of b.paragraphs) {
    L.para(p, reg, SMALL, { lead: 10.4 });
    L.y -= 2;
  }
  if (b.acknowledge !== undefined) {
    L.ensure(14);
    L.y -= 12;
    const ack = Boolean(b.acknowledgedOn);
    tickBox(L.page, M.left, L.y - 1.5, ack, 8);
    const msg = ack
      ? `Read and acknowledged by the proposer on ${b.acknowledgedOn ?? ''}: ${b.acknowledge}`
      : `Not yet acknowledged: ${b.acknowledge}`;
    const lines = wrap(italic, msg, SMALL, CW - 14);
    lines.forEach((ln, i) => {
      if (i > 0) L.y -= 10.4;
      text(L.page, ln, M.left + 13, L.y, italic, SMALL, ack ? INK : GREY);
    });
  }
  L.y -= 6;
}

function drawBlock(L: Layout, b: Block): void {
  const { bold, italic } = L.f;
  switch (b.kind) {
    case 'heading': {
      L.ensure(LINE_H * 3);
      L.y -= 8;
      L.para(b.number ? `${b.number}  ${b.title}` : b.title, bold, 10, { lead: 14 });
      if (b.description) L.para(b.description, italic, SMALL, { lead: 10.4 });
      return;
    }
    case 'note':
      L.y -= 2;
      L.para(b.text, italic, SMALL, { lead: 10.4, color: GREY });
      return;
    case 'line':
      drawLine(L, b.items);
      return;
    case 'choices':
      drawChoices(L, b);
      return;
    case 'table':
      drawTable(L, b);
      return;
    case 'read':
      drawRead(L, b);
      return;
    case 'files': {
      const item: LineItem = {
        label: b.label,
        value: b.statement ?? (b.files.length ? `Attached: ${b.files.join(', ')}` : 'Not attached'),
      };
      if (b.number) item.number = b.number;
      drawFull(L, item);
      L.y -= 1;
      return;
    }
  }
}

// ---------------------------------------------------------------------------------------------

function drawFirstHeader(L: Layout, m: DocModel): void {
  const { bold, reg } = L.f;
  if (L.logo) {
    const w = 118;
    const h = (L.logo.height / L.logo.width) * w;
    L.page.drawImage(L.logo, { x: (A4.width - w) / 2, y: L.y - h, width: w, height: h });
    L.y -= h + 4;
  }
  for (const line of LETTERHEAD) {
    L.y -= 8.6;
    centred(L.page, line, L.y, bold, 6.8);
  }
  L.y -= 22;
  for (const line of wrap(bold, m.title, 13, CW)) {
    centred(L.page, line, L.y, bold, 13);
    L.y -= 16;
  }
  if (m.subtitle) {
    for (const line of wrap(bold, m.subtitle, 10.5, CW)) {
      centred(L.page, line, L.y, bold, 10.5);
      L.y -= 14;
    }
  }
  L.y += 6;
  if (m.preamble.length) {
    L.y -= 6;
    for (const p of m.preamble) {
      L.para(p, reg, SMALL, { lead: 10.4 });
      L.y -= 3;
    }
  }
  L.y -= 4;
}

function drawDeclaration(L: Layout, m: DocModel, sig: PDFImage | null): void {
  const { reg, bold, italic } = L.f;
  const d = m.declaration;
  L.ensure(140);
  L.y -= 14;
  if (d.title) {
    L.para(d.title, bold, 10.5, { lead: 15 });
    L.y -= 2;
  }
  for (const p of d.paragraphs) {
    L.para(p, reg, LABEL, { lead: 12.6 });
    L.y -= 4;
  }
  for (const items of d.lines) drawLine(L, items);

  // Signature line with the image sitting over the dots, then name and date.
  L.ensure(72);
  L.y -= 44;
  const base = L.y;
  const sigLabel = d.signatureLabel;
  const sw = widthOf(reg, sigLabel, LABEL);
  text(L.page, sigLabel, M.left, base, reg, LABEL);
  const sigEnd = M.left + CW * 0.6;
  dots(L.page, M.left + sw + 3, sigEnd, base - 1.2);
  if (sig) {
    const maxW = sigEnd - (M.left + sw + 12);
    const maxH = 40;
    const scale = Math.min(maxW / sig.width, maxH / sig.height);
    const w = sig.width * scale;
    const h = sig.height * scale;
    L.page.drawImage(sig, { x: M.left + sw + 10, y: base - 4, width: w, height: h });
  } else if (m.draft) {
    text(L.page, 'NOT SIGNED (DRAFT)', M.left + sw + 14, base + 1.2, italic, SMALL, GREY);
  }
  const dl = d.dateLabel;
  const dx = sigEnd + 14;
  text(L.page, dl, dx, base, reg, LABEL);
  const dlw = widthOf(reg, dl, LABEL);
  dots(L.page, dx + dlw + 3, M.left + CW, base - 1.2);
  if (d.signedDate) text(L.page, d.signedDate, dx + dlw + 7, base + 1.2, reg, ANSWER, INK);

  L.y -= LINE_H;
  const nl = 'Name of proposer';
  text(L.page, nl, M.left, L.y, reg, LABEL);
  const nw = widthOf(reg, nl, LABEL);
  dots(L.page, M.left + nw + 3, sigEnd, L.y - 1.2);
  if (d.signedName) text(L.page, d.signedName, M.left + nw + 7, L.y + 1.2, reg, ANSWER, INK);
  if (!m.draft && d.signaturePng) {
    L.y -= 13;
    text(
      L.page,
      'Signed electronically: see the electronic signature record at the end of this document.',
      M.left,
      L.y,
      italic,
      7.2,
      GREY,
    );
  }
}

function drawRecord(L: Layout, m: DocModel): void {
  const { reg, bold, italic } = L.f;
  L.newPage();
  L.y -= 4;
  L.para('ELECTRONIC SIGNATURE RECORD', bold, 13, { lead: 18 });
  L.para(
    m.draft
      ? 'This proposal has not been signed. The record below will be completed when the proposer signs and submits it.'
      : 'This proposal was signed electronically by the proposer under the Electronic Transactions Act, 2008 (Act 772). The details below link the signature to the proposer and allow any later change to the answers to be detected.',
    italic,
    SMALL,
    { lead: 10.6, color: GREY },
  );
  L.y -= 8;
  const labelW = 170;
  for (const r of m.record.rows) {
    const lines = wrap(reg, r.value, 9, CW - labelW - 8);
    const h = Math.max(1, lines.length) * 11.5 + 5;
    L.ensure(h);
    L.page.drawLine({
      start: { x: M.left, y: L.y },
      end: { x: M.left + CW, y: L.y },
      thickness: 0.4,
      color: LIGHT,
    });
    text(L.page, r.label, M.left + 2, L.y - 11, bold, 8.6);
    lines.forEach((ln, i) =>
      text(L.page, ln, M.left + labelW, L.y - 11 - i * 11.5, reg, 9, r.value === 'Not recorded' ? GREY : INK),
    );
    L.y -= h;
  }
  L.page.drawLine({
    start: { x: M.left, y: L.y },
    end: { x: M.left + CW, y: L.y },
    thickness: 0.4,
    color: LIGHT,
  });

  L.y -= 14;
  L.ensure(30);
  L.para('CONFIRMATIONS ACCEPTED BEFORE SIGNING', bold, 9.5, { lead: 14 });
  if (m.record.confirmations.length === 0) L.para('None (not signed).', italic, 8.6, { color: GREY });
  for (const c of m.record.confirmations) {
    const lines = wrap(reg, c, 8.8, CW - 18);
    L.ensure(lines.length * 11 + 4);
    L.y -= 12;
    tickBox(L.page, M.left, L.y - 1.5, true, 8);
    lines.forEach((ln, i) => text(L.page, ln, M.left + 15, L.y - i * 11, reg, 8.8));
    L.y -= (lines.length - 1) * 11 + 2;
  }

  L.y -= 14;
  L.ensure(40);
  L.para('DOCUMENTS ATTACHED', bold, 9.5, { lead: 14 });
  if (m.record.files.length === 0) {
    L.para('No documents attached.', italic, 8.6, { color: GREY });
  } else {
    const cols = [
      { label: 'Kind', w: 0.24 },
      { label: 'File name', w: 0.38 },
      { label: 'Size', w: 0.12 },
      { label: 'Uploaded at', w: 0.26 },
    ];
    const head = () => {
      L.ensure(16);
      L.page.drawRectangle({ x: M.left, y: L.y - 14, width: CW, height: 14, color: rgb(0.94, 0.94, 0.94) });
      let x = M.left;
      for (const c of cols) {
        text(L.page, c.label, x + 3, L.y - 10, bold, 8);
        x += c.w * CW;
      }
      L.y -= 14;
    };
    head();
    for (const f of m.record.files) {
      const vals = [f.kind, f.name, f.size, f.uploadedAt];
      const wrapped = vals.map((v, i) => wrap(reg, v, 8, (cols[i]?.w ?? 0.2) * CW - 6));
      const h = Math.max(...wrapped.map((w) => w.length)) * 10 + 5;
      if (L.y - h < M.bottom) {
        L.newPage();
        head();
      }
      let x = M.left;
      wrapped.forEach((lines, i) => {
        lines.forEach((ln, k) => text(L.page, ln, x + 3, L.y - 10 - k * 10, reg, 8));
        x += (cols[i]?.w ?? 0.2) * CW;
      });
      L.y -= h;
      L.page.drawLine({
        start: { x: M.left, y: L.y },
        end: { x: M.left + CW, y: L.y },
        thickness: 0.4,
        color: LIGHT,
      });
    }
  }
  L.y -= 6;
  L.para(
    'File contents are not embedded in this document. Serene Insurance keeps the files with the proposal; each is identified above by name, size and upload time.',
    italic,
    7.6,
    { color: GREY, lead: 10 },
  );
}

function drawFooters(L: Layout, m: DocModel): void {
  const { reg, bold } = L.f;
  const n = L.pages.length;
  L.pages.forEach((p, i) => {
    p.drawLine({ start: { x: M.left, y: 36 }, end: { x: M.left + CW, y: 36 }, thickness: 0.5, color: LIGHT });
    const left = `Proposal no. ${m.proposalNo}  ·  ${m.productName}${m.draft ? '  ·  DRAFT' : ''}`;
    text(p, left, M.left, 25, reg, 7.4, GREY);
    const right = `Page ${i + 1} of ${n}`;
    text(p, right, M.left + CW - widthOf(reg, right, 7.4), 25, reg, 7.4, GREY);
    centred(p, 'Serene Insurance Company Limited', 14, reg, 6.6, LIGHT);
    if (m.draft) {
      const size = 118;
      const w = bold.widthOfTextAtSize('DRAFT', size);
      const cx = A4.width / 2;
      const cy = A4.height / 2;
      const a = Math.PI / 4;
      // Rotate around the page centre so the word sits diagonally in the middle.
      p.drawText('DRAFT', {
        x: cx - (w / 2) * Math.cos(a) + size * 0.35 * Math.sin(a),
        y: cy - (w / 2) * Math.sin(a) - size * 0.35 * Math.cos(a),
        size,
        font: bold,
        color: rgb(0.8, 0.8, 0.8),
        opacity: 0.35,
        rotate: degrees(45),
      });
    }
  });
}

async function embedPng(doc: PDFDocument, bytes: Uint8Array | undefined): Promise<PDFImage | null> {
  if (!bytes || bytes.length === 0) return null;
  try {
    return await doc.embedPng(bytes);
  } catch {
    return null;
  }
}

export async function renderProposalPdf(model: DocModel, assets: RenderAssets): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(winAnsi(`${model.title} - ${model.proposalNo}`));
  doc.setAuthor('Serene Insurance Company Limited');
  doc.setSubject(winAnsi(`${model.productName} proposal ${model.proposalNo}`));
  doc.setCreator('Serene online sales');
  const fonts: Fonts = {
    reg: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
  };
  const logo = await embedPng(doc, assets.logoPng);
  const sig = model.draft ? null : await embedPng(doc, model.declaration.signaturePng);

  const L = new Layout(doc, fonts, logo);
  L.newPage(true);
  drawFirstHeader(L, model);
  for (const b of model.blocks) drawBlock(L, b);
  drawDeclaration(L, model, sig);
  drawRecord(L, model);
  drawFooters(L, model);
  return doc.save();
}
