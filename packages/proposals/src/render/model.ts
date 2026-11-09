// Layout-neutral model of a completed proposal form. buildProposalDocument() turns a form
// definition + answers into blocks in paper order; the PDF and Word renderers only lay them out.
import type {
  Answers,
  AnswerValue,
  Field,
  FormDefinition,
  Section,
  SignatureInfo,
  TableField,
  TableRow,
} from '../schema';
import { evaluate, printedFields, visibleFields, visibleSections } from '../validate';
import { dateTime, dayOf, fileSize, money, optionLabel, scalarText, toNumber, integer } from './format';

export interface ProposalMeta {
  proposalNo: string;
  productName: string;
  /** ISO timestamp; absent for drafts. */
  submittedAt?: string;
  customerNo: string;
  phone: string;
  /** Absent (or without imagePng) for an unsigned draft. */
  signature?: SignatureInfo;
  /** Confirmations the customer ticked before signing (global + form), with their text. */
  confirmations: readonly { id: string; label: string }[];
  files: readonly { kind: string; name: string; size: number; createdAt: string }[];
  ip?: string;
  userAgent?: string;
  answersSha256?: string;
  /** ProposalStatus; 'draft' prints the DRAFT watermark. */
  status: string;
}

/** One "LABEL ……… answer" pair. `yesno` prints YES / NO with the chosen one marked instead of a line. */
export interface LineItem {
  number?: string;
  label: string;
  value: string;
  yesno?: 'yes' | 'no' | null;
}

export type Block =
  | { kind: 'heading'; number?: string; title: string; description?: string }
  | { kind: 'note'; text: string }
  /** Items printed on one line (fields sharing `row`); a renderer may wrap them if they do not fit. */
  | { kind: 'line'; items: LineItem[] }
  | {
      kind: 'choices';
      number?: string;
      label: string;
      multi: boolean;
      options: { label: string; selected: boolean }[];
      /** "Others (please specify)" with the text written in. */
      other?: { label: string; selected: boolean; text: string };
    }
  | {
      kind: 'table';
      number?: string;
      label: string;
      columns: { label: string; weight: number; numeric: boolean }[];
      /** Already padded to printRows with empty rows. */
      rows: string[][];
    }
  | {
      kind: 'read';
      label: string;
      paragraphs: string[];
      acknowledge?: string;
      acknowledgedOn?: string | null;
    }
  /** `statement` replaces the "Attached: …" text (e.g. the NIA face photo, never named on paper). */
  | { kind: 'files'; number?: string; label: string; files: string[]; statement?: string };

export interface DocModel {
  formId: string;
  title: string;
  subtitle?: string;
  preamble: string[];
  productName: string;
  proposalNo: string;
  draft: boolean;
  blocks: Block[];
  declaration: {
    title?: string;
    paragraphs: string[];
    /** Fields with docPlacement 'declaration' and the declaration's own fields, grouped by row. */
    lines: LineItem[][];
    signatureLabel: string;
    dateLabel: string;
    signedName: string;
    signedDate: string;
    /** PNG bytes of the signature, if signed. */
    signaturePng?: Uint8Array;
  };
  /** Final page "Electronic signature record". */
  record: {
    rows: { label: string; value: string }[];
    confirmations: string[];
    files: { kind: string; name: string; size: string; uploadedAt: string }[];
  };
}

// ---------------------------------------------------------------------------------------------

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
  if (typeof atob === 'function') {
    const bin = atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(0);
}

const printLabel = (f: { label: string; docLabel?: string }) => f.docLabel ?? f.label;

function joinNumber(sectionNo: string | undefined, fieldNo: string | undefined): string | undefined {
  const fmt = (n: string) => (/[.)]$/.test(n) ? n : `${n}.`);
  if (sectionNo && fieldNo) return `${fmt(sectionNo)} ${fmt(fieldNo)}`;
  if (sectionNo) return fmt(sectionNo);
  if (fieldNo) return fmt(fieldNo);
  return undefined;
}

function cellText(col: TableField['columns'][number], v: AnswerValue | undefined): string {
  if (v === undefined || v === null || v === '') return '';
  const n = toNumber(v);
  switch (col.type) {
    case 'money':
      return n === null ? String(v) : money(n);
    case 'number':
      return n === null ? String(v) : col.unit ? `${integer(n)} ${col.unit}` : integer(n);
    case 'date':
      return typeof v === 'string' ? dayOf(v) : String(v);
    case 'select':
      return optionLabel(col.options, v);
    default:
      return String(v);
  }
}

interface Ctx {
  answers: Answers;
  meta: ProposalMeta;
  /** Date shown for "read and acknowledged" and age calculations. */
  onIso: string;
}

function yesNoValue(v: AnswerValue | undefined): 'yes' | 'no' | null {
  return v === 'yes' || v === true ? 'yes' : v === 'no' || v === false ? 'no' : null;
}

function lineItem(field: Field, ctx: Ctx, number: string | undefined): LineItem {
  const item: LineItem = { label: printLabel(field), value: scalarText(field, ctx.answers, ctx.onIso) };
  if (number) item.number = number;
  // "Sum insured GH₵ ……" already prints the currency: write the amount only.
  if (field.type === 'money' && /(GH[S₵¢]|US\$|USD|EUR|GBP|€|£)\s*[:.]?\s*$/i.test(item.label))
    item.value = item.value.replace(/^[A-Z]{3} /, '');
  if (field.type === 'yesno') {
    item.value = '';
    item.yesno = yesNoValue(ctx.answers[field.id]);
  }
  return item;
}

/** Fields that print as a "label ……… answer" line and can share a row. */
const isLineField = (f: Field) =>
  f.type === 'text' ||
  f.type === 'textarea' ||
  f.type === 'email' ||
  f.type === 'phone' ||
  f.type === 'number' ||
  f.type === 'money' ||
  f.type === 'percent' ||
  f.type === 'year' ||
  f.type === 'date' ||
  f.type === 'select' ||
  f.type === 'yesno';

function filesFor(field: Field & { type: 'file' }, ctx: Ctx): string[] {
  const v = ctx.answers[field.id];
  const count = Array.isArray(v) ? v.length : 0;
  const named = ctx.meta.files.filter((f) => f.kind === field.kind).map((f) => f.name);
  if (named.length > 0) return named;
  return count > 0 ? [`${count} file${count === 1 ? '' : 's'} attached`] : [];
}

/** Blocks for a list of visible fields (a section's or the declaration's). */
function fieldBlocks(fields: readonly Field[], ctx: Ctx, sectionNo: string | undefined): Block[] {
  const out: Block[] = [];
  let pendingSectionNo = sectionNo;
  const takeNo = (f: Field) => {
    const n = joinNumber(pendingSectionNo, f.number);
    pendingSectionNo = undefined;
    return n;
  };
  let i = 0;
  while (i < fields.length) {
    const field = fields[i] as Field;
    if (isLineField(field)) {
      const items: LineItem[] = [];
      const followUps: Block[] = [];
      const row = field.row;
      let j = i;
      do {
        const f = fields[j] as Field;
        items.push(lineItem(f, ctx, takeNo(f)));
        if (f.type === 'yesno' && f.details && ctx.answers[f.id] === f.details.when) {
          followUps.push({
            kind: 'line',
            items: [{ label: printLabel(f.details), value: String(ctx.answers[`${f.id}__details`] ?? '') }],
          });
        }
        j++;
      } while (
        row &&
        j < fields.length &&
        (fields[j] as Field).row === row &&
        isLineField(fields[j] as Field)
      );
      out.push({ kind: 'line', items }, ...followUps);
      i = j;
      continue;
    }
    i++;
    const number = takeNo(field);
    switch (field.type) {
      case 'radio':
      case 'checkboxes': {
        const v = ctx.answers[field.id];
        const picked = field.type === 'checkboxes' ? (Array.isArray(v) ? (v as readonly string[]) : []) : [v];
        const block: Block = {
          kind: 'choices',
          label: printLabel(field),
          multi: field.type === 'checkboxes',
          options: field.options.map((o) => ({ label: o.label, selected: picked.includes(o.value) })),
        };
        if (number) block.number = number;
        if (field.allowOther) {
          const text = ctx.answers[`${field.id}__other`];
          block.other = {
            label: 'Others (please specify)',
            selected: picked.includes('__other'),
            text: picked.includes('__other') && typeof text === 'string' ? text : '',
          };
        }
        out.push(block);
        break;
      }
      case 'table': {
        const v = ctx.answers[field.id];
        const rows = Array.isArray(v) ? (v as readonly TableRow[]) : [];
        const body = rows.map((r) => field.columns.map((c) => cellText(c, r[c.id])));
        const target = Math.max(field.printRows ?? 0, rows.length, 1);
        while (body.length < target) body.push(field.columns.map(() => ''));
        const block: Block = {
          kind: 'table',
          label: printLabel(field),
          columns: field.columns.map((c) => ({
            label: c.unit && c.type !== 'money' ? `${c.label} (${c.unit})` : c.label,
            weight: c.weight ?? 1,
            numeric: c.type === 'money' || c.type === 'number',
          })),
          rows: body,
        };
        if (number) block.number = number;
        out.push(block);
        break;
      }
      case 'read': {
        const ack = ctx.answers[field.id] === true;
        const block: Block = { kind: 'read', label: printLabel(field), paragraphs: [...field.paragraphs] };
        if (field.acknowledge) {
          block.acknowledge = field.acknowledge;
          block.acknowledgedOn = ack ? dayOf(ctx.onIso) : null;
        }
        out.push(block);
        break;
      }
      case 'file': {
        const block: Block = { kind: 'files', label: printLabel(field), files: filesFor(field, ctx) };
        if (field.kind === 'id_selfie' && block.files.length > 0)
          block.statement = 'Identity check: face photo provided for NIA verification';
        if (number) block.number = number;
        out.push(block);
        break;
      }
      default:
        break;
    }
  }
  return out;
}

function groupLines(fields: readonly Field[], ctx: Ctx): LineItem[][] {
  const lines: LineItem[][] = [];
  for (const b of fieldBlocks(fields, ctx, undefined)) {
    if (b.kind === 'line') lines.push(b.items);
    else if (b.kind === 'choices') {
      const chosen = b.options.filter((o) => o.selected).map((o) => o.label);
      if (b.other?.selected) chosen.push(b.other.text || b.other.label);
      lines.push([{ label: b.label, value: chosen.join(', ') }]);
    } else if (b.kind === 'files') lines.push([{ label: b.label, value: b.statement ?? b.files.join(', ') }]);
  }
  return lines;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft (not signed)',
  submitted: 'Submitted',
  under_review: 'Under review',
  info_requested: 'Information requested',
  quoted: 'Quoted',
  declined: 'Declined',
  paid: 'Paid',
  issued: 'Policy issued',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

const METHOD_LABELS: Record<string, string> = {
  drawn: 'Drawn on screen',
  typed: 'Typed name rendered as signature',
  uploaded: 'Uploaded image of signature',
};

export function buildProposalDocument(def: FormDefinition, answers: Answers, meta: ProposalMeta): DocModel {
  const signed = Boolean(meta.signature?.signedAt) && meta.status !== 'draft';
  const onIso = meta.signature?.signedAt ?? meta.submittedAt ?? new Date().toISOString();
  const ctx: Ctx = { answers, meta, onIso };

  const blocks: Block[] = [];
  const declarationFields: Field[] = [];
  for (const step of def.steps) {
    for (const section of visibleSections(step, answers)) {
      // Uploads are not printed: a section of uploads only (identity check, vehicle documents,
      // photos…) disappears, and the files themselves live with the proposal's documents.
      const fields = printedFields(visibleFields(section, answers));
      const inSection = fields.filter((f) => f.docPlacement !== 'declaration');
      declarationFields.push(...fields.filter((f) => f.docPlacement === 'declaration'));
      if (inSection.length === 0) continue;
      pushSection(blocks, section, inSection, ctx);
    }
  }
  for (const f of printedFields(def.declaration.fields ?? []))
    if (evaluate(f.showIf, answers)) declarationFields.push(f);

  const sig = meta.signature;
  const sigBytes = signed && sig?.imagePng ? base64ToBytes(sig.imagePng) : undefined;

  const rows: { label: string; value: string }[] = [
    { label: 'Proposal number', value: meta.proposalNo },
    { label: 'Product', value: meta.productName },
    { label: 'Customer number', value: meta.customerNo },
    { label: 'Status', value: STATUS_LABELS[meta.status] ?? meta.status },
    { label: 'Signed name', value: signed ? (sig?.signedName ?? '') : 'Not signed' },
    { label: 'Phone (verified by one-time code)', value: meta.phone },
    { label: 'Signed at', value: signed && sig ? dateTime(sig.signedAt) : '' },
    { label: 'Submitted at', value: meta.submittedAt ? dateTime(meta.submittedAt) : '' },
    { label: 'Signature method', value: signed && sig ? (METHOD_LABELS[sig.method] ?? sig.method) : '' },
    { label: 'IP address', value: meta.ip ?? '' },
    { label: 'Device (user agent)', value: meta.userAgent ?? '' },
    { label: 'Answers SHA-256', value: meta.answersSha256 ?? '' },
  ];

  const model: DocModel = {
    formId: def.id,
    title: def.title,
    preamble: [...(def.preamble ?? [])],
    productName: meta.productName,
    proposalNo: meta.proposalNo,
    draft: !signed,
    blocks,
    declaration: {
      paragraphs: [...def.declaration.paragraphs],
      lines: groupLines(declarationFields, ctx),
      signatureLabel: def.declaration.signatureLabel,
      dateLabel: def.declaration.dateLabel ?? 'Date',
      signedName: signed ? (sig?.signedName ?? '') : '',
      signedDate: signed && sig ? dayOf(sig.signedAt) : '',
    },
    record: {
      rows: rows.map((r) => ({ label: r.label, value: r.value || 'Not recorded' })),
      confirmations: signed ? meta.confirmations.map((c) => c.label) : [],
      files: meta.files.map((f) => ({
        kind: f.kind.replace(/_/g, ' '),
        name: f.name,
        size: fileSize(f.size),
        uploadedAt: dateTime(f.createdAt),
      })),
    },
  };
  if (def.subtitle) model.subtitle = def.subtitle;
  if (def.declaration.title) model.declaration.title = def.declaration.title;
  if (sigBytes && sigBytes.length > 0) model.declaration.signaturePng = sigBytes;
  return model;
}

function pushSection(blocks: Block[], section: Section, fields: readonly Field[], ctx: Ctx): void {
  let sectionNo = section.number;
  if (section.title) {
    const h: Block = { kind: 'heading', title: section.title };
    if (section.number) h.number = joinNumber(section.number, undefined) ?? section.number;
    blocks.push(h);
    sectionNo = undefined;
  }
  // Section descriptions are wizard help text; paper notices are modelled as `read` fields.
  blocks.push(...fieldBlocks(fields, ctx, sectionNo));
}
