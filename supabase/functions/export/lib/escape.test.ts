import { describe, expect, it } from 'vitest';
import { csvField, csvHeader, csvRow, escapeFormula, escapeXml, type Column } from './escape.ts';

describe('formula-injection escaping (SPEC FILES, OWASP CSV injection)', () => {
  it.each(['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tx', '\rx', '=HYPERLINK("http://x")'])(
    'prefixes %j',
    (v) => {
      expect(escapeFormula(v)).toBe(`'${v}`);
    },
  );
  it('leaves ordinary text alone', () => {
    expect(escapeFormula('Great service')).toBe('Great service');
    expect(escapeFormula('a=b')).toBe('a=b');
  });
});

describe('CSV fields (RFC 4180)', () => {
  const cols: Column[] = [
    { key: 'a', label: 'A', type: 'text' },
    { key: 'n', label: 'N', type: 'number' },
    { key: 'b', label: 'B', type: 'boolean' },
  ];
  it('quotes commas, quotes and newlines and doubles embedded quotes', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('line\nbreak')).toBe('"line\nbreak"');
  });
  it('escapes formulas inside text cells, including ones that also need quoting', () => {
    expect(csvField('=1,2')).toBe(`"'=1,2"`);
    expect(csvField('-5')).toBe(`'-5`);
  });
  it('keeps numbers in number columns as numbers, even negative ones', () => {
    expect(csvField(-5, 'number')).toBe('-5');
    expect(csvField(Number.NaN, 'number')).toBe('');
  });
  it('writes rows with CRLF, empty for null, Yes/No for booleans', () => {
    expect(csvRow(['x', 3, true], cols)).toBe('x,3,Yes\r\n');
    expect(csvRow([null, undefined, false], cols)).toBe(',,No\r\n');
  });
  it('starts the header with a UTF-8 BOM', () => {
    expect(csvHeader(cols)).toBe('﻿A,N,B\r\n');
  });
});

describe('XML escaping', () => {
  it('escapes markup and drops characters XML forbids', () => {
    expect(escapeXml('<a href="x">&</a>\u0001')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });
});
