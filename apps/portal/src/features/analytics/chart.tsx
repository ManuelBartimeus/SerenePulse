import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import { Alert } from '../../ui/controls';

const LOADERS = {
  line: () => import('./echarts-line'),
  bar: () => import('./echarts-bar'),
} as const;
export type ChartKind = keyof typeof LOADERS;

/**
 * Lazy ECharts canvas with an accessible name and a data-table alternative (WCAG 1.1.1). The table is
 * the source of truth for screen-reader and keyboard users; the canvas is decorative for them.
 */
export function Chart({
  kind,
  option,
  label,
  table,
  height = 280,
}: {
  kind: ChartKind;
  option: EChartsCoreOption;
  label: string;
  table: ReactNode;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const instance = useRef<{
    setOption: (o: EChartsCoreOption, notMerge: boolean) => void;
    dispose: () => void;
    resize: () => void;
  } | null>(null);

  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | undefined;
    Promise.all([import('./echarts-core'), LOADERS[kind]()])
      .then(([{ echarts }, mod]) => {
        if (disposed || !ref.current) return;
        echarts.use([mod.chart]);
        const chart = echarts.init(ref.current, undefined, { renderer: 'canvas' });
        instance.current = chart;
        chart.setOption({ aria: { enabled: true, label: { description: label } }, ...option }, true);
        observer = new ResizeObserver(() => chart.resize());
        observer.observe(ref.current);
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      observer?.disconnect();
      instance.current?.dispose();
      instance.current = null;
    };
    // The chart is re-created when its type changes; option updates go through setOption below.
  }, [kind]);

  useEffect(() => {
    instance.current?.setOption({ aria: { enabled: true, label: { description: label } }, ...option }, true);
  }, [option, label]);

  return (
    <div>
      {failed ? (
        <Alert tone="warning">The chart couldn’t load. The figures are in the table below.</Alert>
      ) : (
        <div ref={ref} role="img" aria-label={label} style={{ height }} className="w-full" />
      )}
      <details className="mt-2" open={failed}>
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-[14px] font-medium text-brand">
          Show as table
        </summary>
        <div className="mt-2 overflow-x-auto">{table}</div>
      </details>
    </div>
  );
}
