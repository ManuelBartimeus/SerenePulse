import { describe, expect, it } from 'vitest';
import { layoutReport, PAGE, toWinAnsi, truncate, wrap, type Measure } from './layout.ts';
import { buildModel, caseRows, fmt, ghDate, ghDateTime, type Claim } from './model.ts';
import { reportSheets } from './report-xlsx.ts';
import { secretMatches, timingSafeEqual } from './secret.ts';

// Fixed-width font: 0.5 × size per character.
const measure: Measure = (t, size) => t.length * size * 0.5;

const m = (value: number | null, n = 40) => ({
  value,
  n,
  low_sample: n < 30,
  benchmark: null,
  delta: null,
  target: null,
});
function claim(rows = 3, key: Claim['report_key'] = 'weekly_branch'): Claim {
  const row = (i: number) => ({
    label: `Branch ${i}`,
    n: 10 + i,
    csat_pct: 80.123,
    nps: 12.4,
    ces_avg: 2.345,
    negative_rate: 5,
    low_sample: true,
    main_factor_label: 'Waiting time',
  });
  return {
    run_id: 'r',
    report_key: key,
    schedule_id: 's',
    schedule_name: 'Accra weekly',
    period: { from: '2026-11-02', to: '2026-11-08', tz: 'Africa/Accra' },
    filters: [{ label: 'Branches', value: 'Accra Central' }],
    generated_at: '2026-11-09T07:00:05Z',
    generated_by: 'Ama Mensah',
    trigger: 'schedule',
    files: [{ id: 'f', format: 'pdf' }],
    settings: { legal_name: 'Serene Insurance LTD', display_name: 'Serene Insurance', minimum_sample: 30 },
    data: {
      summary: {
        n: 120,
        unverified_excluded: 3,
        main_factor: { labels: ['Waiting time'], share: 41.2, n: 80 },
        metrics: {
          csat_pct: m(81.5),
          csat_avg: m(4.1),
          nps: m(23),
          ces_avg: m(2.2),
          negative_rate: m(null, 0),
          completion_rate: m(77),
        },
      },
      breakdowns: { branch: Array.from({ length: rows }, (_, i) => row(i)), region: null },
      months: [],
      cases: { open: 4, overdue: 1, resolution_days: { mean: 2.5, median: 2 }, filters: {} },
      survey_versions: [1, 2],
    },
  };
}

describe('report model', () => {
  it('formats dates in en-GH and Africa/Accra', () => {
    expect(ghDate('2026-11-02')).toBe('02/11/2026');
    expect(ghDateTime('2026-11-09T07:00:05Z')).toBe('09/11/2026 07:00');
  });
  it('never shows missing values as zero (Rule 7)', () => {
    expect(fmt(null, 'pct')).toBe('No data');
    expect(fmt(0, 'pct')).toBe('0.0%');
    expect(fmt(23, 'nps')).toBe('+23');
  });
  it('states period, time zone, filters, generator, versions, n, minimum sample and unverified count', () => {
    const model = buildModel(claim(), 'production');
    const meta = Object.fromEntries(model.meta);
    expect(meta['Period']).toContain('02/11/2026 to 08/11/2026');
    expect(meta['Time zone']).toBe('Africa/Accra');
    expect(meta['Filters']).toBe('Branches: Accra Central');
    expect(meta['Generated']).toBe('09/11/2026 07:00 by Ama Mensah');
    expect(meta['Survey versions']).toBe('v1, v2');
    expect(meta['Minimum sample']).toBe('30 responses');
    expect(meta['Unverified submissions excluded']).toBe('3');
    expect(model.footer).toBe('Serene Insurance LTD · Confidential');
    expect(model.demo).toBe(false);
  });
  it('marks every non-production report as demo data (Rule 14)', () => {
    expect(buildModel(claim(), 'staging').demo).toBe(true);
  });
  it('explains a breakdown that the mixed-scale guard withheld', () => {
    const t = buildModel(claim(), 'production').tables.find((x) => x.title === 'By region')!;
    expect(t.rows).toHaveLength(0);
    expect(t.note).toMatch(/rating scales/);
  });
  it('shows n with every KPI', () => {
    const k = buildModel(claim(), 'production').kpis;
    expect(k.every((x) => x.detail.startsWith('n = '))).toBe(true);
    expect(k.find((x) => x.label.startsWith('Negative'))!.value).toBe('No data');
  });
  it('flattens case metrics one level', () => {
    expect(caseRows({ open: 4, resolution_days: { mean: 2.5 }, filters: {} })).toEqual([
      ['Open cases', 4],
      ['resolution_days – mean', 2.5],
    ]);
  });
  it('builds the quarterly month table', () => {
    const c = claim(1, 'quarterly_trend');
    c.data.months = [{ from: '2026-10-01', to: '2026-10-31', summary: c.data.summary }];
    expect(buildModel(c, 'production').tables[0]!.rows[0]).toEqual([
      '01/10/2026 – 31/10/2026',
      120,
      81.5,
      23,
      2.2,
      null,
    ]);
  });
  it('produces a Summary sheet plus one sheet per table', () => {
    const sheets = reportSheets(buildModel(claim(), 'production'));
    expect(sheets.map((s) => s.name)).toEqual(['Summary', 'branch', 'region', 'Feedback cases']);
  });
});

describe('PDF layout', () => {
  it('maps text to WinAnsi', () => {
    expect(toWinAnsi('Kɔkɔ – café\nok')).toBe('Koko – café ok');
    expect(toWinAnsi('漢')).toBe('?');
  });
  it('wraps and truncates to the width', () => {
    expect(wrap('aaa bbb ccc', 35, 10, false, measure)).toEqual(['aaa bbb', 'ccc']);
    expect(truncate('abcdefghij', 30, 10, false, measure)).toBe('abcde…');
  });
  it('paginates long tables, repeats the header and numbers every page', () => {
    const { ops, pages } = layoutReport(buildModel(claim(120), 'production'), measure);
    expect(pages).toBeGreaterThan(2);
    for (let p = 1; p <= pages; p++) {
      expect(ops.some((o) => o.page === p && o.kind === 'text' && o.text === `Page ${p} of ${pages}`)).toBe(
        true,
      );
      expect(
        ops.some(
          (o) => o.page === p && o.kind === 'text' && o.text === 'Serene Insurance LTD · Confidential',
        ),
      ).toBe(true);
    }
    // The branch table continues over several pages: each of them starts with a header band.
    const headerPages = new Set(
      ops.filter((o) => o.kind === 'rect' && o.fill === 'brand').map((o) => o.page),
    );
    expect(headerPages.size).toBe(pages);
  });
  it('keeps everything inside the margins', () => {
    const { ops } = layoutReport(buildModel(claim(60), 'staging'), measure);
    for (const o of ops) {
      expect(o.x).toBeGreaterThanOrEqual(PAGE.margin - 0.01);
      expect(o.y).toBeGreaterThan(0);
      expect(o.y).toBeLessThan(PAGE.height - PAGE.margin - PAGE.headerHeight + 1);
      if (o.kind === 'text')
        expect(o.x + measure(o.text, o.size, o.bold)).toBeLessThanOrEqual(PAGE.width - PAGE.margin + 0.01);
    }
    expect(ops.some((o) => o.kind === 'text' && o.text.startsWith('Demo data'))).toBe(true);
  });
});

describe('jobs secret', () => {
  it('compares in constant time and rejects short or missing secrets', async () => {
    const s = 'x'.repeat(40);
    expect(await secretMatches(s, s)).toBe(true);
    expect(await secretMatches(s + 'y', s)).toBe(false);
    expect(await secretMatches(null, s)).toBe(false);
    expect(await secretMatches('short', 'short')).toBe(false);
    expect(timingSafeEqual(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false);
  });
});
