// XLSX rendering of a ReportModel: a Summary sheet (header facts + KPIs) and one sheet per table.
import { SharedStrings, SheetWriter } from '../../export/lib/xlsx.ts';
import type { ReportModel } from './model.ts';

export function reportSheets(model: ReportModel): SheetWriter[] {
  const preamble = [
    `${model.title}${model.demo ? ' (DEMO DATA: not real customer feedback)' : ''}`,
    model.subtitle,
    ...model.meta.map(([k, v]) => `${k}: ${v}`),
    model.footer,
  ];
  const sst = new SharedStrings();
  const summary = new SheetWriter(
    {
      name: 'Summary',
      preamble,
      columns: [
        { key: 'metric', label: 'Metric', type: 'text' },
        { key: 'value', label: 'Value', type: 'text' },
        { key: 'detail', label: 'Detail', type: 'text' },
      ],
      widths: [38, 14, 60],
    },
    sst,
  );
  summary.addRows(model.kpis.map((k) => [k.label, k.value, k.detail]));
  const sheets = [summary];
  for (const t of model.tables) {
    const s = new SheetWriter(
      {
        name: t.title.replace(/^By /, ''),
        preamble: [t.title, model.subtitle, ...(t.note ? [t.note] : [])],
        columns: t.columns,
      },
      sst,
    );
    s.addRows(t.rows);
    sheets.push(s);
  }
  return sheets;
}
