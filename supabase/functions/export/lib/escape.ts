// Cell escaping shared by CSV and XLSX output (SPEC FILES: "CSV/XLSX cells are escaped for formulas").
// Pure module: no Deno or npm imports, so vitest can run it under Node.

export type CellType = 'text' | 'number' | 'boolean';
export interface Column {
  key: string;
  label: string;
  type: CellType;
}

/**
 * Neutralises text a spreadsheet would execute (OWASP CSV injection): a leading = + - @ TAB or CR
 * gets an apostrophe prefix.
 */
export function escapeFormula(text: string): string {
  const c = text.charCodeAt(0);
  return c === 61 || c === 43 || c === 45 || c === 64 || c === 9 || c === 13 ? `'${text}` : text;
}

// XML 1.0 forbids most C0 control characters even when escaped; they are dropped.
// eslint-disable-next-line no-control-regex
const XML_SPECIAL = /[&<>"\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/;
// eslint-disable-next-line no-control-regex
const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function escapeXml(text: string): string {
  if (!XML_SPECIAL.test(text)) return text;
  return text
    .replace(XML_INVALID, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Display text for a value, formula-escaped. */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return escapeFormula(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'object') return escapeFormula(JSON.stringify(value));
  return escapeFormula(String(value));
}

const CSV_QUOTE = /[",\r\n]|^\s|\s$/;

/** One CSV field (RFC 4180). Quotes when needed, doubles embedded quotes. */
export function csvField(value: unknown, type: CellType = 'text'): string {
  if (value === null || value === undefined) return '';
  if (type === 'number' && typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const text = cellText(value);
  return CSV_QUOTE.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvRow(values: readonly unknown[], columns: readonly Column[]): string {
  let line = '';
  for (let i = 0; i < columns.length; i++) {
    if (i > 0) line += ',';
    line += csvField(values[i], columns[i]!.type);
  }
  return line + '\r\n';
}

/** UTF-8 BOM so Excel opens accented names correctly. */
export const CSV_BOM = '﻿';

export function csvHeader(columns: readonly Column[]): string {
  return CSV_BOM + columns.map((c) => csvField(c.label)).join(',') + '\r\n';
}
