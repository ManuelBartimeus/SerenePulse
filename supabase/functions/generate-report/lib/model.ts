// Turns the jsonb returned by public.report_run_claim into a format-neutral report model that the
// PDF and XLSX renderers draw. Pure: no Deno or npm imports (vitest runs it under Node).
import type { Column } from '../../export/lib/escape.ts';

interface Metric {
  value: number | null;
  n: number;
  low_sample?: boolean;
  delta?: number | null;
  target?: { value: number; status: 'met' | 'not_met' } | null;
}
interface BreakdownRow {
  label: string;
  n: number;
  csat_pct: number | null;
  nps: number | null;
  ces_avg: number | null;
  negative_rate: number | null;
  low_sample: boolean;
  main_factor_label: string | null;
}
interface Summary {
  n: number;
  metrics: Record<string, Metric>;
  unverified_excluded?: number;
  main_factor?: { labels: string[]; share: number | null; n: number };
}
export interface Claim {
  run_id: string;
  report_key: 'daily_operational' | 'weekly_branch' | 'monthly_executive' | 'quarterly_trend';
  schedule_id: string;
  schedule_name: string;
  period: { from: string; to: string; tz: string };
  filters: { label: string; value: string }[];
  generated_at: string;
  generated_by: string | null;
  trigger: 'schedule' | 'on_demand';
  files: { id: string; format: 'pdf' | 'xlsx' }[];
  settings: { legal_name: string | null; display_name: string | null; minimum_sample: number | null };
  data: {
    summary: Summary;
    breakdowns: Record<string, BreakdownRow[] | null>;
    months: { from: string; to: string; summary: Summary }[];
    cases: Record<string, unknown> | null;
    survey_versions: number[];
  };
}

export interface Kpi {
  label: string;
  value: string;
  detail: string;
}
export interface Table {
  title: string;
  columns: Column[];
  rows: unknown[][];
  note?: string;
}
export interface ReportModel {
  title: string;
  subtitle: string;
  meta: [string, string][];
  kpis: Kpi[];
  tables: Table[];
  notes: string[];
  demo: boolean;
  footer: string;
}

export const REPORT_TITLES: Record<Claim['report_key'], string> = {
  daily_operational: 'Daily operational summary',
  weekly_branch: 'Weekly branch report',
  monthly_executive: 'Monthly executive report',
  quarterly_trend: 'Quarterly trend report',
};

const DIMENSION_TITLES: Record<string, string> = {
  branch: 'By branch',
  region: 'By region',
  channel: 'By service channel',
  product: 'By insurance product',
  factor: 'By improvement factor',
  source: 'By survey source',
};

/** DD/MM/YYYY from YYYY-MM-DD (en-GH). */
export function ghDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** DD/MM/YYYY HH:MM in Africa/Accra (= UTC, no DST). */
export function ghDateTime(iso: string): string {
  const t = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(t.getUTCDate())}/${p(t.getUTCMonth() + 1)}/${t.getUTCFullYear()} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

/** "No data" is never shown as 0 (Rule 7). */
export function fmt(value: number | null | undefined, kind: 'pct' | 'score' | 'nps' | 'int'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'No data';
  switch (kind) {
    case 'pct':
      return `${value.toFixed(1)}%`;
    case 'score':
      return value.toFixed(2);
    case 'nps':
      return (value > 0 ? '+' : '') + value.toFixed(0);
    case 'int':
      return value.toLocaleString('en-GB');
  }
}

const KPI_DEFS: [string, string, 'pct' | 'score' | 'nps'][] = [
  ['csat_pct', 'Satisfied (CSAT %)', 'pct'],
  ['csat_avg', 'Average satisfaction (1–5)', 'score'],
  ['nps', 'Net Promoter Score', 'nps'],
  ['ces_avg', 'Average effort (1–5, lower is easier)', 'score'],
  ['negative_rate', 'Negative feedback rate', 'pct'],
  ['completion_rate', 'Survey completion rate', 'pct'],
];

function kpis(summary: Summary): Kpi[] {
  return KPI_DEFS.map(([key, label, kind]) => {
    const m = summary.metrics[key];
    const parts = [`n = ${fmt(m?.n ?? 0, 'int')}`];
    if (m?.low_sample) parts.push('low sample');
    if (m?.target)
      parts.push(`target ${fmt(m.target.value, kind)} ${m.target.status === 'met' ? 'met' : 'not met'}`);
    if (m?.delta !== null && m?.delta !== undefined)
      parts.push(`${m.delta >= 0 ? '+' : ''}${m.delta.toFixed(1)} vs previous`);
    return { label, value: fmt(m?.value ?? null, kind), detail: parts.join(' · ') };
  });
}

const BREAKDOWN_COLUMNS: Column[] = [
  { key: 'label', label: 'Group', type: 'text' },
  { key: 'n', label: 'Responses (n)', type: 'number' },
  { key: 'csat_pct', label: 'CSAT %', type: 'number' },
  { key: 'nps', label: 'NPS', type: 'number' },
  { key: 'ces_avg', label: 'Effort (1–5)', type: 'number' },
  { key: 'negative_rate', label: 'Negative %', type: 'number' },
  { key: 'main_factor', label: 'Main improvement factor', type: 'text' },
  { key: 'low_sample', label: 'Low sample', type: 'boolean' },
];

const round = (v: number | null, d: number) => (v === null || v === undefined ? null : Number(v.toFixed(d)));

function breakdownTable(dim: string, rows: BreakdownRow[] | null, minSample: number): Table {
  const title = DIMENSION_TITLES[dim] ?? `By ${dim}`;
  if (rows === null) {
    return {
      title,
      columns: BREAKDOWN_COLUMNS,
      rows: [],
      note: 'Not shown: the period mixes survey versions with different rating scales.',
    };
  }
  return {
    title,
    columns: BREAKDOWN_COLUMNS,
    rows: rows.map((r) => [
      r.label,
      r.n,
      round(r.csat_pct, 1),
      round(r.nps, 0),
      round(r.ces_avg, 2),
      round(r.negative_rate, 1),
      r.main_factor_label,
      r.low_sample,
    ]),
    note: `Groups with fewer than ${minSample} responses are marked low sample and should not be ranked.`,
  };
}

const CASE_LABELS: Record<string, string> = {
  open: 'Open cases',
  overdue: 'Overdue cases',
  resolution_rate: 'Resolution rate %',
  sla_compliance_pct: 'SLA compliance %',
  escalation_rate: 'Escalation rate %',
  resolution_days_mean: 'Mean resolution time (working days)',
  resolution_days_median: 'Median resolution time (working days)',
};

/** Flattens D's case_metrics (shape owned by D) into label/value rows; nested objects are expanded one level. */
export function caseRows(cases: Record<string, unknown> | null): unknown[][] {
  if (!cases) return [];
  const rows: unknown[][] = [];
  for (const [k, v] of Object.entries(cases)) {
    if (k === 'filters' || k === 'period') continue;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
        if (typeof v2 === 'number' || v2 === null) rows.push([`${CASE_LABELS[k] ?? k} – ${k2}`, v2]);
      }
    } else if (typeof v === 'number' || v === null) {
      rows.push([CASE_LABELS[k] ?? k.replace(/_/g, ' '), v]);
    }
  }
  return rows;
}

export function buildModel(claim: Claim, appEnv: string): ReportModel {
  const s = claim.data.summary;
  const minSample = Number(claim.settings.minimum_sample ?? 30);
  const legal = claim.settings.legal_name ?? 'Serene Insurance LTD';
  const tables: Table[] = [];

  if (claim.report_key === 'quarterly_trend') {
    tables.push({
      title: 'Month by month',
      columns: [
        { key: 'month', label: 'Month', type: 'text' },
        { key: 'n', label: 'Responses (n)', type: 'number' },
        { key: 'csat_pct', label: 'CSAT %', type: 'number' },
        { key: 'nps', label: 'NPS', type: 'number' },
        { key: 'ces_avg', label: 'Effort (1–5)', type: 'number' },
        { key: 'negative_rate', label: 'Negative %', type: 'number' },
      ],
      rows: claim.data.months.map((m) => [
        `${ghDate(m.from)} – ${ghDate(m.to)}`,
        m.summary.n,
        round(m.summary.metrics.csat_pct?.value ?? null, 1),
        round(m.summary.metrics.nps?.value ?? null, 0),
        round(m.summary.metrics.ces_avg?.value ?? null, 2),
        round(m.summary.metrics.negative_rate?.value ?? null, 1),
      ]),
    });
  }
  for (const [dim, rows] of Object.entries(claim.data.breakdowns))
    tables.push(breakdownTable(dim, rows, minSample));
  const cases = caseRows(claim.data.cases);
  tables.push({
    title: 'Feedback cases',
    columns: [
      { key: 'measure', label: 'Measure', type: 'text' },
      { key: 'value', label: 'Value', type: 'number' },
    ],
    rows: cases,
    ...(cases.length === 0 ? { note: 'No case figures for this period.' } : {}),
  });

  const versions = claim.data.survey_versions;
  const main = s.main_factor;
  return {
    title: REPORT_TITLES[claim.report_key],
    subtitle: `${claim.schedule_name} · ${ghDate(claim.period.from)} to ${ghDate(claim.period.to)}`,
    meta: [
      ['Period', `${ghDate(claim.period.from)} to ${ghDate(claim.period.to)} (submission date)`],
      ['Time zone', claim.period.tz],
      [
        'Filters',
        claim.filters.length ? claim.filters.map((f) => `${f.label}: ${f.value}`).join('; ') : 'None',
      ],
      ['Generated', `${ghDateTime(claim.generated_at)} by ${claim.generated_by ?? 'the scheduler'}`],
      ['Survey versions', versions.length ? versions.map((v) => `v${v}`).join(', ') : 'None in this period'],
      ['Responses (n)', fmt(s.n, 'int')],
      ['Minimum sample', `${minSample} responses`],
      ['Unverified submissions excluded', fmt(s.unverified_excluded ?? 0, 'int')],
      [
        'Main improvement factor',
        main && main.labels.length
          ? `${main.labels.join(' / ')} (${fmt(main.share, 'pct')} of ${fmt(main.n, 'int')})`
          : 'No data',
      ],
    ],
    kpis: kpis(s),
    tables,
    notes: [
      'Percentages use valid (verified) responses as the denominator; "No data" means no responses, not zero.',
      'Branch figures use the branch the customer reported, with approved attribution corrections applied.',
    ],
    demo: appEnv !== 'production',
    footer: `${legal} · Confidential`,
  };
}
