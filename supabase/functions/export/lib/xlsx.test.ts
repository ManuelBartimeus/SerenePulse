import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildWorkbook, cellXml, columnLetter, safeSheetName, SharedStrings, SheetWriter } from './xlsx.ts';
import { crc32 } from './zip.ts';

/** Reads a ZIP produced by zip() back into name → text. */
function unzip(buf: Uint8Array): Map<string, string> {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out = new Map<string, string>();
  let p = 0;
  while (v.getUint32(p, true) === 0x04034b50) {
    const size = v.getUint32(p + 18, true);
    const nameLen = v.getUint16(p + 26, true);
    const name = new TextDecoder().decode(buf.subarray(p + 30, p + 30 + nameLen));
    const data = buf.subarray(p + 30 + nameLen, p + 30 + nameLen + size);
    const raw = inflateRawSync(data);
    expect(crc32(new Uint8Array(raw))).toBe(v.getUint32(p + 14, true));
    out.set(name, raw.toString('utf8'));
    p += 30 + nameLen + size;
  }
  return out;
}

describe('XLSX writer', () => {
  it('names columns like Excel', () => {
    expect([0, 25, 26, 27, 701, 702].map(columnLetter)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  });
  it('makes sheet names valid and unique', () => {
    const taken = new Set<string>();
    expect(safeSheetName('By branch/region [x]', taken)).toBe('By branch region  x');
    expect(safeSheetName('A'.repeat(40), taken)).toHaveLength(31);
    expect(safeSheetName('a'.repeat(40), taken)).toMatch(/\(2\)$/);
  });
  it('writes typed cells; text is formula-escaped, shared and never a formula', () => {
    const sst = new SharedStrings();
    expect(cellXml(sst, 4, 'number')).toBe('<c><v>4</v></c>');
    expect(cellXml(sst, true, 'boolean')).toBe('<c t="b"><v>1</v></c>');
    expect(cellXml(sst, '=cmd|x', 'text')).toBe('<c t="s"><v>0</v></c>');
    expect(cellXml(sst, 'Accra', 'text')).toBe('<c t="s"><v>1</v></c>');
    expect(cellXml(sst, 'Accra', 'text')).toBe('<c t="s"><v>1</v></c>');
    expect(cellXml(sst, null, 'text')).toBe('<c/>');
    expect(sst.xml()).toContain(`<si><t xml:space="preserve">'=cmd|x</t></si>`);
    expect(sst.xml()).toContain('count="3" uniqueCount="2"');
    expect(sst.xml()).not.toContain('<f>');
  });
  it('packages a valid workbook with a frozen header and the rows', async () => {
    const s = new SheetWriter({
      name: 'Feedback',
      columns: [
        { key: 'r', label: 'Reference', type: 'text' },
        { key: 'c', label: 'CSAT', type: 'number' },
      ],
    });
    s.addRows([
      ['FB-2026-000001', 5],
      ['<b>&', null],
    ]);
    expect(s.rowCount).toBe(2);
    const files = unzip(await buildWorkbook([s]));
    expect([...files.keys()]).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
      'xl/sharedStrings.xml',
    ]);
    const sheet = files.get('xl/worksheets/sheet1.xml')!;
    expect(sheet).toContain('state="frozen"');
    expect(sheet).toContain('<row r="2"><c t="s"><v>2</v></c><c><v>5</v></c></row>');
    expect(sheet).toContain('<row r="3"><c t="s"><v>3</v></c><c/></row>');
    expect(files.get('xl/sharedStrings.xml')).toContain('&lt;b&gt;&amp;');
    expect(files.get('xl/workbook.xml')).toContain('name="Feedback"');
  });
  it('puts the preamble above the header and freezes below the header', () => {
    const s = new SheetWriter({
      name: 'S',
      preamble: ['Title', 'Period'],
      columns: [{ key: 'a', label: 'A', type: 'text' }],
    });
    const xml = s.xml();
    expect(xml).toContain('<row r="4"><c t="s" s="1"><v>2</v></c></row>');
    expect(xml).toContain('ySplit="4" topLeftCell="A5"');
  });
});
