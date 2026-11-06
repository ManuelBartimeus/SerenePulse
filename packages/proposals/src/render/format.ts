// Pure formatting helpers shared by the document renderers and the certificate builder.
// No pdf-lib / docx imports here, so certificate.ts can use them in the Worker too.
import type { AnswerValue, Field, OptionsRef } from '../schema';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** 1234.5 → "1,234.50" */
export function amount(n: number): string {
  return n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 1234.5 → "GHS 1,234.50" (the cedi sign is not in the PDF standard fonts). */
export function money(n: number, currency = 'GHS'): string {
  return `${currency} ${amount(n)}`;
}

export function integer(n: number): string {
  return n.toLocaleString('en-GB', { maximumFractionDigits: 2 });
}

function parseIsoDate(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function ordinal(d: number): string {
  const rem100 = d % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${d}th`;
  const s = d % 10 === 1 ? 'st' : d % 10 === 2 ? 'nd' : d % 10 === 3 ? 'rd' : 'th';
  return `${d}${s}`;
}

/** "2024-11-26" → "26th November, 2024" (certificate style). */
export function certDate(iso: string): string {
  const p = parseIsoDate(iso);
  if (!p) return iso;
  return `${ordinal(p.d)} ${MONTHS[p.m - 1] ?? ''}, ${p.y}`;
}

/** "2024-11-26" → "26 November 2024" (proposal answers). */
export function longDate(iso: string): string {
  const p = parseIsoDate(iso);
  if (!p) return iso;
  return `${p.d} ${MONTHS[p.m - 1] ?? ''} ${p.y}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Ghana (Africa/Accra) is UTC+0 all year, so UTC fields give local time. */
function accra(isoTs: string): Date | null {
  const t = Date.parse(isoTs);
  return Number.isNaN(t) ? null : new Date(t);
}

/** ISO timestamp → "21/11/2024" (Accra time). */
export function slashDate(isoTs: string): string {
  const d = accra(isoTs);
  if (!d) return isoTs;
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** ISO timestamp → "6:45:57 PM" (Accra time). */
export function clockTime(isoTs: string): string {
  const d = accra(isoTs);
  if (!d) return isoTs;
  const h = d.getUTCHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${h < 12 ? 'AM' : 'PM'}`;
}

/** ISO timestamp → "6 November 2026, 14:32:05 GMT" (Accra time). */
export function dateTime(isoTs: string): string {
  const d = accra(isoTs);
  if (!d) return isoTs;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ''} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(
    d.getUTCMinutes(),
  )}:${pad(d.getUTCSeconds())} GMT`;
}

/** ISO date or timestamp → "6 November 2026". */
export function dayOf(isoTs: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoTs)) return longDate(isoTs);
  const d = accra(isoTs);
  if (!d) return isoTs;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ''} ${d.getUTCFullYear()}`;
}

export function ageOn(dobIso: string, onIso: string): number | null {
  const b = parseIsoDate(dobIso);
  const t = Date.parse(onIso);
  if (!b || Number.isNaN(t)) return null;
  const on = new Date(t);
  let age = on.getUTCFullYear() - b.y;
  const m = on.getUTCMonth() + 1 - b.m;
  if (m < 0 || (m === 0 && on.getUTCDate() < b.d)) age--;
  return age;
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function optionLabel(options: OptionsRef | undefined, value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return options?.find((o) => o.value === s)?.label ?? s;
}

const toNumber = (v: AnswerValue | undefined): number | null => {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean' || Array.isArray(v)) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export { toNumber };

/** Currency of a money field: fixed, chosen by the customer (`${id}__currency`) or GHS. */
export function currencyOf(field: Field, answers: Record<string, AnswerValue>): string {
  if (field.type !== 'money') return 'GHS';
  if (field.currency === 'select') {
    const c = answers[`${field.id}__currency`];
    return typeof c === 'string' && c ? c.toUpperCase() : 'GHS';
  }
  return field.currency ?? 'GHS';
}

/**
 * Plain-text answer of a scalar field as printed on the document ("" when unanswered).
 * Choice fields give their option label(s); `__other` gives the "other" text.
 */
export function scalarText(field: Field, answers: Record<string, AnswerValue>, onIso?: string): string {
  const v = answers[field.id];
  if (v === undefined || v === null || v === '') return '';
  switch (field.type) {
    case 'money': {
      const n = toNumber(v);
      return n === null ? String(v) : money(n, currencyOf(field, answers));
    }
    case 'number': {
      const n = toNumber(v);
      if (n === null) return String(v);
      return field.unit ? `${integer(n)} ${field.unit}` : integer(n);
    }
    case 'percent':
      return `${String(v)}%`;
    case 'year':
      return String(v);
    case 'date': {
      if (typeof v !== 'string') return String(v);
      const label = field.docLabel ?? field.label;
      if (/^age\b/i.test(label) && onIso) {
        const age = ageOn(v, onIso);
        if (age !== null) return `${age} (born ${longDate(v)})`;
      }
      return longDate(v);
    }
    case 'select':
    case 'radio': {
      if (v === '__other') {
        const other = answers[`${field.id}__other`];
        return typeof other === 'string' ? other : 'Other';
      }
      return optionLabel(field.options, v);
    }
    case 'checkboxes': {
      if (!Array.isArray(v)) return String(v);
      return (v as readonly string[])
        .map((x) =>
          x === '__other' ? String(answers[`${field.id}__other`] ?? 'Other') : optionLabel(field.options, x),
        )
        .join(', ');
    }
    case 'yesno':
      return v === 'yes' ? 'Yes' : v === 'no' ? 'No' : String(v);
    case 'table':
    case 'file':
      return Array.isArray(v) ? `${v.length}` : '';
    case 'read':
      return v === true ? 'Read and acknowledged' : '';
    default:
      return typeof v === 'string' ? v : String(v);
  }
}

// ---------------------------------------------------------------------------------------------
// WinAnsi sanitising (pdf-lib standard fonts throw on characters outside Windows-1252).

const CP1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

const REPLACEMENTS: Record<string, string> = {
  '≤': '<=',
  '≥': '>=',
  '≠': '!=',
  '→': '->',
  '←': '<-',
  '↔': '<->',
  '✓': 'v',
  '✔': 'v',
  '☑': '[x]',
  '☐': '[ ]',
  '−': '-',
  '‐': '-',
  '‑': '-',
  '‒': '-',
  '―': '-',
  '′': "'",
  '″': '"',
  '‹': '<',
  '›': '>',
  '‚': ',',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  '​': '',
  '‌': '',
  '‍': '',
  '﻿': '',
  '\t': ' ',
  '\r': '',
};

function isWinAnsi(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  if (c === 10) return true;
  if (c >= 0x20 && c <= 0x7e) return true;
  if (c >= 0xa0 && c <= 0xff) return true;
  return CP1252_EXTRA.includes(ch);
}

/** Makes any text safe for pdf-lib's WinAnsi standard fonts. "GH₵ 5" → "GHS 5". */
export function winAnsi(text: string): string {
  let s = text.replace(/(?:GH\s?)?[₵¢](?=\d)/g, 'GHS ').replace(/(?:GH\s?)?[₵¢]/g, 'GHS');
  let out = '';
  for (const ch of s) {
    if (isWinAnsi(ch)) {
      out += ch;
      continue;
    }
    const rep = REPLACEMENTS[ch];
    if (rep !== undefined) {
      out += rep;
      continue;
    }
    // Strip accents that are not in Latin-1 (e.g. "ŋ", "ɛ", "ŕ").
    const base = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    if (base && [...base].every(isWinAnsi)) {
      out += base;
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x1f000 || (code >= 0x2600 && code <= 0x27bf)) continue; // emoji and dingbats
    out += '?';
  }
  s = out;
  return s;
}
