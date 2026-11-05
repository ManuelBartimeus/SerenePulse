// Small XLSX (SpreadsheetML) writer: shared strings, one bold header style, frozen header row,
// column widths. Written for Edge Function CPU budgets (spike S-03): no DOM, rows appended as
// strings, data cells without explicit references (positions are sequential, ECMA-376 §18.3.1.4).
import { cellText, escapeXml, type Column } from './escape.ts';
import { zip } from './zip.ts';

export interface SheetSpec {
  name: string;
  columns: readonly Column[];
  /** Plain text lines above the table (report headers: period, filters…). */
  preamble?: readonly string[];
  widths?: readonly number[];
}

export function columnLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Excel sheet names: ≤ 31 characters, none of []:*?/\ , unique within the workbook. */
export function safeSheetName(name: string, taken: Set<string>): string {
  const base = (name.replace(/[[\]:*?/\\]/g, ' ').trim() || 'Sheet').slice(0, 31);
  let candidate = base;
  for (let i = 2; taken.has(candidate.toLowerCase()); i++) {
    const suffix = ` (${i})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

/** Workbook-wide shared-string table: repeated labels (branch, channel…) are stored once. */
export class SharedStrings {
  private readonly index = new Map<string, number>();
  private readonly list: string[] = [];
  count = 0;
  id(text: string): number {
    this.count++;
    let i = this.index.get(text);
    if (i === undefined) {
      i = this.list.length;
      this.index.set(text, i);
      this.list.push(text);
    }
    return i;
  }
  xml(): string {
    const items = this.list.map((t) => `<si><t xml:space="preserve">${escapeXml(t)}</t></si>`).join('');
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${this.count}" uniqueCount="${this.list.length}">` +
      items +
      '</sst>'
    );
  }
}

/** One cell. Text is formula-escaped and stored as a shared string (never a formula). */
export function cellXml(sst: SharedStrings, value: unknown, type: Column['type'], style = 0): string {
  if (value === null || value === undefined) return '<c/>';
  const s = style ? ` s="${style}"` : '';
  if (type === 'number' && typeof value === 'number')
    return Number.isFinite(value) ? `<c${s}><v>${value}</v></c>` : '<c/>';
  if (type === 'boolean' && typeof value === 'boolean') return `<c t="b"${s}><v>${value ? 1 : 0}</v></c>`;
  const text = cellText(value);
  return text === '' ? '<c/>' : `<c t="s"${s}><v>${sst.id(text)}</v></c>`;
}

/** Accumulates one worksheet's XML. Call addRows as pages arrive. */
export class SheetWriter {
  readonly name: string;
  readonly spec: SheetSpec;
  readonly sst: SharedStrings;
  private readonly parts: string[] = [];
  private row = 0;
  private readonly headerRow: number;
  constructor(spec: SheetSpec, sst: SharedStrings = new SharedStrings()) {
    this.spec = spec;
    this.sst = sst;
    this.name = spec.name;
    for (const line of spec.preamble ?? []) {
      this.row++;
      this.parts.push(`<row r="${this.row}">${cellXml(sst, line, 'text', this.row === 1 ? 1 : 0)}</row>`);
    }
    if (spec.preamble?.length) this.row++; // blank spacer row
    this.row++;
    this.headerRow = this.row;
    this.parts.push(
      `<row r="${this.row}">${spec.columns.map((c) => cellXml(sst, c.label, 'text', 1)).join('')}</row>`,
    );
  }

  addRows(rows: readonly (readonly unknown[])[]): void {
    const cols = this.spec.columns;
    const n = cols.length;
    for (const values of rows) {
      this.row++;
      let xml = `<row r="${this.row}">`;
      for (let i = 0; i < n; i++) xml += cellXml(this.sst, values[i], cols[i]!.type);
      this.parts.push(xml + '</row>');
    }
  }

  get rowCount(): number {
    return this.row - this.headerRow;
  }

  xml(): string {
    const widths =
      this.spec.widths ?? this.spec.columns.map((c) => Math.min(Math.max(c.label.length + 2, 10), 50));
    const cols = widths
      .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
      .join('');
    const top = `A${this.headerRow + 1}`;
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${this.headerRow}" topLeftCell="${top}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
      `<cols>${cols}</cols><sheetData>${this.parts.join('')}</sheetData></worksheet>`
    );
  }
}

const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
  '</styleSheet>';

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml';

/** Packages finished sheets (sharing one SharedStrings table) into an .xlsx file. */
export async function buildWorkbook(sheets: readonly SheetWriter[]): Promise<Uint8Array> {
  if (sheets.length === 0) throw new Error('A workbook needs at least one sheet.');
  const sst = sheets[0]!.sst;
  if (sheets.some((s) => s.sst !== sst))
    throw new Error('All sheets of a workbook must share one SharedStrings table.');
  const enc = new TextEncoder();
  const taken = new Set<string>();
  const names = sheets.map((s) => safeSheetName(s.name, taken));
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const files: { name: string; data: Uint8Array }[] = [
    {
      name: '[Content_Types].xml',
      data: enc.encode(
        head +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          `<Override PartName="/xl/workbook.xml" ContentType="${CT}.sheet.main+xml"/>` +
          `<Override PartName="/xl/styles.xml" ContentType="${CT}.styles+xml"/>` +
          `<Override PartName="/xl/sharedStrings.xml" ContentType="${CT}.sharedStrings+xml"/>` +
          sheets
            .map(
              (_, i) =>
                `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${CT}.worksheet+xml"/>`,
            )
            .join('') +
          '</Types>',
      ),
    },
    {
      name: '_rels/.rels',
      data: enc.encode(
        head +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/>` +
          '</Relationships>',
      ),
    },
    {
      name: 'xl/workbook.xml',
      data: enc.encode(
        head +
          `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL}">` +
          `<sheets>${names.map((n, i) => `<sheet name="${escapeXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
          '</workbook>',
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: enc.encode(
        head +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          sheets
            .map(
              (_, i) =>
                `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
            )
            .join('') +
          `<Relationship Id="rId${sheets.length + 1}" Type="${REL}/styles" Target="styles.xml"/>` +
          `<Relationship Id="rId${sheets.length + 2}" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/>` +
          '</Relationships>',
      ),
    },
    { name: 'xl/styles.xml', data: enc.encode(STYLES) },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(s.xml()) })),
    { name: 'xl/sharedStrings.xml', data: enc.encode(sst.xml()) },
  ];
  return zip(files);
}
