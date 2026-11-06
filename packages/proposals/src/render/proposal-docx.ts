// Completed proposal form as a Word document (same structure as the PDF).
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  LeaderType,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  UnderlineType,
  VerticalAlign,
  WidthType,
  type ParagraphChild,
} from 'docx';
import { TextWatermark } from 'docx/watermarks';
import type { Block, DocModel, LineItem } from './model';
import type { RenderAssets } from './proposal-pdf';
import { LETTERHEAD } from './proposal-pdf';

const FONT = 'Arial';
const INK = '1A2E86';
const GREY = '666666';
const SYMBOL = 'Segoe UI Symbol';
/** Text width of an A4 page with 0.75" margins, in twips. */
const PAGE_W = 11906;
const MARGIN = 1000;
const TEXT_W = PAGE_W - 2 * MARGIN;
const sz = (pt: number) => Math.round(pt * 2);

/** Drops control characters (other than tab and newline) that are invalid in WordprocessingML. */
const clean = (s: string) =>
  [...s]
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c >= 0x20 || c === 0x09 || c === 0x0a;
    })
    .join('');

function run(
  textValue: string,
  opts: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {},
): TextRun {
  return new TextRun({
    text: clean(textValue),
    font: FONT,
    size: sz(opts.size ?? 9.5),
    ...(opts.bold ? { bold: true } : {}),
    ...(opts.italics ? { italics: true } : {}),
    ...(opts.color ? { color: opts.color } : {}),
  });
}

/** The answer, in ink, on a dotted underline (what the PDF writes over the leader dots). */
function answer(value: string, size = 10): TextRun[] {
  const parts = clean(value).split('\n');
  return parts.map(
    (p, i) =>
      new TextRun({
        text: ` ${p} `,
        font: FONT,
        size: sz(size),
        color: INK,
        underline: { type: UnderlineType.DOTTED, color: '777777' },
        ...(i > 0 ? { break: 1 } : {}),
      }),
  );
}

const box = (ticked: boolean) =>
  new TextRun({ text: ticked ? '☑' : '☐', font: SYMBOL, size: sz(11), color: ticked ? INK : '000000' });

function yesNo(value: 'yes' | 'no' | null | undefined): TextRun[] {
  const word = (w: 'yes' | 'no') =>
    new TextRun({
      text: w.toUpperCase(),
      font: FONT,
      size: sz(9.5),
      ...(value === w ? { bold: true, color: INK } : {}),
    });
  return [
    run('   '),
    word('yes'),
    run(' '),
    box(value === 'yes'),
    run('     '),
    word('no'),
    run(' '),
    box(value === 'no'),
  ];
}

const itemLabel = (it: LineItem) => (it.number ? `${it.number} ${it.label}` : it.label);

function lineParagraph(items: readonly LineItem[]): Paragraph {
  const n = items.length;
  const children: ParagraphChild[] = [];
  items.forEach((it, i) => {
    children.push(run(`${itemLabel(it)} `));
    if (it.yesno !== undefined) children.push(...yesNo(it.yesno));
    else if (it.value) children.push(...answer(it.value));
    if (it.yesno === undefined) children.push(new TextRun({ text: '\t', font: FONT, size: sz(9.5) }));
    else if (i < n - 1) children.push(run('\t'));
  });
  return new Paragraph({
    spacing: { before: 80, after: 40 },
    tabStops: items.map((_, i) => ({
      type: i === n - 1 ? TabStopType.RIGHT : TabStopType.LEFT,
      position: i === n - 1 ? TEXT_W : Math.round((TEXT_W * (i + 1)) / n) - 120,
      leader: LeaderType.DOT,
    })),
    children,
  });
}

/** Rough text width in twips (Arial averages about half an em per character). */
const approxWidth = (s: string, pt: number) => Math.round(s.length * pt * 10.5);

/** Packs a row's items onto as few paragraphs as fit the line, like the PDF. */
function linesFor(items: readonly LineItem[]): Paragraph[] {
  const need = (it: LineItem) =>
    approxWidth(itemLabel(it), 9.5) +
    (it.yesno !== undefined ? 1500 : Math.max(approxWidth(it.value, 11.5), 700) + 500);
  const groups: LineItem[][] = [];
  let used = 0;
  for (const it of items) {
    const n = need(it);
    const last = groups[groups.length - 1];
    if (last && used + n <= TEXT_W && !it.value.includes('\n')) {
      last.push(it);
      used += n;
    } else {
      groups.push([it]);
      used = n;
    }
  }
  return groups.map((g) => lineParagraph(g));
}

const thin = { style: BorderStyle.SINGLE, size: 4, color: '000000' } as const;
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const;
const allBorders = { top: thin, bottom: thin, left: thin, right: thin };
const noBorders = {
  top: none,
  bottom: none,
  left: none,
  right: none,
  insideHorizontal: none,
  insideVertical: none,
};

function cell(
  children: Paragraph[],
  widthTw: number,
  opts: { shade?: boolean; borders?: boolean } = {},
): TableCell {
  return new TableCell({
    children,
    width: { size: widthTw, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 40, bottom: 40, left: 70, right: 70 },
    borders: opts.borders === false ? { top: none, bottom: none, left: none, right: none } : allBorders,
    ...(opts.shade ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F0F0F0' } } : {}),
  });
}

function choiceBlocks(b: Extract<Block, { kind: 'choices' }>): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [
    new Paragraph({
      spacing: { before: 120, after: 40 },
      children: [run(b.number ? `${b.number} ${b.label}` : b.label)],
    }),
  ];
  const opt = (label: string, selected: boolean, extra?: string) =>
    new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: 4000, leader: LeaderType.DOT }],
      children: [run(`${label} `), ...(extra ? answer(extra) : []), run('\t'), run(' '), box(selected)],
    });
  const cols = b.options.length >= 4 ? 2 : 1;
  const perCol = Math.ceil(b.options.length / cols);
  const colW = Math.round((TEXT_W - 400) / cols);
  const rows: TableRow[] = [];
  for (let r = 0; r < perCol; r++) {
    const cells: TableCell[] = [];
    for (let c = 0; c < cols; c++) {
      const o = b.options[c * perCol + r];
      cells.push(cell([o ? opt(o.label, o.selected) : new Paragraph('')], colW, { borders: false }));
    }
    rows.push(new TableRow({ children: cells }));
  }
  out.push(
    new Table({
      rows,
      width: { size: colW * cols, type: WidthType.DXA },
      columnWidths: Array.from({ length: cols }, () => colW),
      indent: { size: 400, type: WidthType.DXA },
      borders: noBorders,
    }),
  );
  if (b.other) {
    out.push(
      new Paragraph({
        indent: { left: 470 },
        tabStops: [{ type: TabStopType.RIGHT, position: TEXT_W - 300, leader: LeaderType.DOT }],
        children: [
          run(`${b.other.label} `),
          ...(b.other.text ? answer(b.other.text) : []),
          run('\t'),
          run(' '),
          box(b.other.selected),
        ],
      }),
    );
  }
  return out;
}

function tableBlock(b: Extract<Block, { kind: 'table' }>): (Paragraph | Table)[] {
  const total = b.columns.reduce((a, c) => a + c.weight, 0) || 1;
  const widths = b.columns.map((c) => Math.round((TEXT_W * c.weight) / total));
  const small = b.columns.length > 7;
  const head = new TableRow({
    tableHeader: true,
    children: b.columns.map((c, i) =>
      cell(
        [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [run(c.label.toUpperCase(), { bold: true, italics: true, size: small ? 6.5 : 7.5 })],
          }),
        ],
        widths[i] ?? 600,
        { shade: true },
      ),
    ),
  });
  const body = b.rows.map(
    (r) =>
      new TableRow({
        height: { value: 320, rule: 'atLeast' },
        children: r.map((v, i) =>
          cell(
            [
              new Paragraph({
                alignment: b.columns[i]?.numeric ? AlignmentType.RIGHT : AlignmentType.LEFT,
                children: [run(v, { size: small ? 7.5 : 8.5, color: INK })],
              }),
            ],
            widths[i] ?? 600,
          ),
        ),
      }),
  );
  return [
    new Paragraph({
      spacing: { before: 140, after: 40 },
      children: [run(b.number ? `${b.number} ${b.label}` : b.label, { bold: true, size: 8.5 })],
    }),
    new Table({ rows: [head, ...body], width: { size: TEXT_W, type: WidthType.DXA }, columnWidths: widths }),
  ];
}

function blockToDocx(b: Block): (Paragraph | Table)[] {
  switch (b.kind) {
    case 'heading':
      return [
        new Paragraph({
          spacing: { before: 220, after: 60 },
          keepNext: true,
          children: [run(b.number ? `${b.number}  ${b.title}` : b.title, { bold: true, size: 10 })],
        }),
        ...(b.description
          ? [new Paragraph({ children: [run(b.description, { italics: true, size: 8 })] })]
          : []),
      ];
    case 'note':
      return [
        new Paragraph({
          spacing: { after: 40 },
          children: [run(b.text, { italics: true, size: 8, color: GREY })],
        }),
      ];
    case 'line':
      return linesFor(b.items);
    case 'choices':
      return choiceBlocks(b);
    case 'table':
      return tableBlock(b);
    case 'read': {
      const out: Paragraph[] = [
        new Paragraph({
          spacing: { before: 160, after: 40 },
          keepNext: true,
          children: [run(b.label.toUpperCase(), { bold: true, size: 8.5 })],
        }),
        ...b.paragraphs.map(
          (p) => new Paragraph({ spacing: { after: 40 }, children: [run(p, { size: 8 })] }),
        ),
      ];
      if (b.acknowledge !== undefined) {
        const ack = Boolean(b.acknowledgedOn);
        out.push(
          new Paragraph({
            spacing: { after: 80 },
            children: [
              box(ack),
              run(
                ack
                  ? ` Read and acknowledged by the proposer on ${b.acknowledgedOn ?? ''}: ${b.acknowledge}`
                  : ` Not yet acknowledged: ${b.acknowledge}`,
                { italics: true, size: 8, color: ack ? INK : GREY },
              ),
            ],
          }),
        );
      }
      return out;
    }
    case 'files': {
      const item: LineItem = {
        label: b.label,
        value: b.statement ?? (b.files.length ? `Attached: ${b.files.join(', ')}` : 'Not attached'),
      };
      if (b.number) item.number = b.number;
      return [lineParagraph([item])];
    }
  }
}

function declarationBlocks(m: DocModel): Paragraph[] {
  const d = m.declaration;
  const out: Paragraph[] = [];
  if (d.title)
    out.push(
      new Paragraph({
        spacing: { before: 280, after: 80 },
        children: [run(d.title, { bold: true, size: 10.5 })],
      }),
    );
  d.paragraphs.forEach((p, i) =>
    out.push(
      new Paragraph({ spacing: { before: i === 0 && !d.title ? 280 : 60, after: 80 }, children: [run(p)] }),
    ),
  );
  for (const items of d.lines) out.push(...linesFor(items));

  const sig: ParagraphChild[] = [run(`${d.signatureLabel} `)];
  if (d.signaturePng && !m.draft) {
    sig.push(
      new ImageRun({
        type: 'png',
        data: d.signaturePng,
        transformation: { width: 150, height: 50 },
        altText: { name: 'Signature', description: `Signature of ${d.signedName}`, title: 'Signature' },
      }),
    );
  } else if (m.draft) sig.push(run(' NOT SIGNED (DRAFT) ', { italics: true, size: 8, color: GREY }));
  sig.push(run('\t'), run(`${d.dateLabel} `), ...(d.signedDate ? answer(d.signedDate) : []), run('\t'));
  out.push(
    new Paragraph({
      spacing: { before: 360, after: 60 },
      tabStops: [
        { type: TabStopType.LEFT, position: Math.round(TEXT_W * 0.6), leader: LeaderType.DOT },
        { type: TabStopType.RIGHT, position: TEXT_W, leader: LeaderType.DOT },
      ],
      children: sig,
    }),
  );
  out.push(
    new Paragraph({
      tabStops: [{ type: TabStopType.LEFT, position: Math.round(TEXT_W * 0.6), leader: LeaderType.DOT }],
      children: [run('Name of proposer '), ...(d.signedName ? answer(d.signedName) : []), run('\t')],
    }),
  );
  return out;
}

function recordBlocks(m: DocModel): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      spacing: { after: 80 },
      children: [run('ELECTRONIC SIGNATURE RECORD', { bold: true, size: 13 })],
    }),
    new Paragraph({
      spacing: { after: 160 },
      children: [
        run(
          m.draft
            ? 'This proposal has not been signed. The record below will be completed when the proposer signs and submits it.'
            : 'This proposal was signed electronically by the proposer under the Electronic Transactions Act, 2008 (Act 772). The details below link the signature to the proposer and allow any later change to the answers to be detected.',
          { italics: true, size: 8, color: GREY },
        ),
      ],
    }),
  ];
  const lw = 3000;
  out.push(
    new Table({
      width: { size: TEXT_W, type: WidthType.DXA },
      columnWidths: [lw, TEXT_W - lw],
      rows: m.record.rows.map(
        (r) =>
          new TableRow({
            children: [
              cell([new Paragraph({ children: [run(r.label, { bold: true, size: 8.5 })] })], lw, {
                shade: true,
              }),
              cell(
                [
                  new Paragraph({
                    children: [run(r.value, { size: 9, color: r.value === 'Not recorded' ? GREY : INK })],
                  }),
                ],
                TEXT_W - lw,
              ),
            ],
          }),
      ),
    }),
  );
  out.push(
    new Paragraph({
      spacing: { before: 240, after: 60 },
      children: [run('CONFIRMATIONS ACCEPTED BEFORE SIGNING', { bold: true, size: 9.5 })],
    }),
  );
  if (m.record.confirmations.length === 0)
    out.push(
      new Paragraph({ children: [run('None (not signed).', { italics: true, size: 8.5, color: GREY })] }),
    );
  for (const c of m.record.confirmations)
    out.push(
      new Paragraph({
        spacing: { after: 40 },
        indent: { left: 300, hanging: 300 },
        children: [box(true), run(` ${c}`, { size: 8.8 })],
      }),
    );

  out.push(
    new Paragraph({
      spacing: { before: 240, after: 60 },
      children: [run('DOCUMENTS ATTACHED', { bold: true, size: 9.5 })],
    }),
  );
  if (m.record.files.length === 0) {
    out.push(
      new Paragraph({ children: [run('No documents attached.', { italics: true, size: 8.5, color: GREY })] }),
    );
  } else {
    const fr = [0.24, 0.38, 0.12, 0.26].map((f) => Math.round(f * TEXT_W));
    const headCells = ['Kind', 'File name', 'Size', 'Uploaded at'].map((h, i) =>
      cell([new Paragraph({ children: [run(h, { bold: true, size: 8 })] })], fr[i] ?? 1000, { shade: true }),
    );
    out.push(
      new Table({
        width: { size: TEXT_W, type: WidthType.DXA },
        columnWidths: fr,
        rows: [
          new TableRow({ tableHeader: true, children: headCells }),
          ...m.record.files.map(
            (f) =>
              new TableRow({
                children: [f.kind, f.name, f.size, f.uploadedAt].map((v, i) =>
                  cell([new Paragraph({ children: [run(v, { size: 8 })] })], fr[i] ?? 1000),
                ),
              }),
          ),
        ],
      }),
    );
  }
  out.push(
    new Paragraph({
      spacing: { before: 120 },
      children: [
        run(
          'File contents are not embedded in this document. Serene Insurance keeps the files with the proposal; each is identified above by name, size and upload time.',
          { italics: true, size: 7.6, color: GREY },
        ),
      ],
    }),
  );
  return out;
}

/** Width / height of a PNG from its IHDR chunk (falls back to the Serene logo's 222 × 108). */
function pngAspect(bytes: Uint8Array): number {
  if (bytes.length < 24) return 222 / 108;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const w = dv.getUint32(16);
  const h = dv.getUint32(20);
  return w > 0 && h > 0 ? w / h : 222 / 108;
}

export async function renderProposalDocx(model: DocModel, assets: RenderAssets): Promise<Uint8Array> {
  const aspect = pngAspect(assets.logoPng);
  const logo = (width: number) =>
    new ImageRun({
      type: 'png',
      data: assets.logoPng,
      transformation: { width, height: Math.round(width / aspect) },
      altText: { name: 'Serene Insurance', description: 'Serene Insurance logo', title: 'Serene Insurance' },
    });
  const watermark = () =>
    model.draft
      ? [new TextWatermark({ text: 'DRAFT', font: FONT, color: 'C8C8C8', opacity: 0.4, bold: true })]
      : [];

  const firstHeader = new Header({ children: [new Paragraph({ children: watermark() })] });
  const defaultHeader = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [...(assets.logoPng.length ? [logo(80)] : []), ...watermark()],
      }),
    ],
  });
  const footer = new Footer({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: TEXT_W }],
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB', space: 4 } },
        children: [
          run(`Proposal no. ${model.proposalNo}  ·  ${model.productName}${model.draft ? '  ·  DRAFT' : ''}`, {
            size: 7.4,
            color: GREY,
          }),
          new TextRun({
            children: ['\tPage ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES],
            font: FONT,
            size: sz(7.4),
            color: GREY,
          }),
        ],
      }),
    ],
  });

  const top: Paragraph[] = [];
  if (assets.logoPng.length)
    top.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [logo(160)] }));
  for (const l of LETTERHEAD)
    top.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [run(l, { bold: true, size: 7 })] }));
  top.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 280, after: 40 },
      children: [run(model.title, { bold: true, size: 13 })],
    }),
  );
  if (model.subtitle)
    top.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [run(model.subtitle, { bold: true, size: 10.5 })],
      }),
    );
  for (const p of model.preamble)
    top.push(new Paragraph({ spacing: { after: 60 }, children: [run(p, { size: 8 })] }));

  const doc = new Document({
    creator: 'Serene online sales',
    title: `${model.title} - ${model.proposalNo}`,
    description: `${model.productName} proposal ${model.proposalNo}`,
    styles: { default: { document: { run: { font: FONT, size: sz(9.5) } } } },
    sections: [
      {
        properties: {
          titlePage: true,
          page: {
            size: { width: PAGE_W, height: 16838 },
            margin: { top: 720, bottom: 900, left: MARGIN, right: MARGIN, header: 360, footer: 400 },
          },
        },
        headers: { first: firstHeader, default: defaultHeader },
        footers: { first: footer, default: footer },
        children: [
          ...top,
          ...model.blocks.flatMap(blockToDocx),
          ...declarationBlocks(model),
          ...recordBlocks(model),
        ],
      },
    ],
  });
  const buf = await Packer.toArrayBuffer(doc);
  return new Uint8Array(buf);
}
