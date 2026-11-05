/**
 * Data-viz palette (SPEC E2, A-43). Categorical: 8 CVD-checked hues in fixed order (validated with the
 * dataviz palette validator on the light surface; contrast below 3:1 for some slots is relieved by
 * direct labels and the data-table alternative). NPS segments are fixed. Sequential heat: 5 steps of
 * the brand hue. Diverging: danger ↔ grey ↔ success.
 */
export const CATEGORICAL = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#6250d6',
  '#e34948',
];
export const BRAND = '#1108bf';
export const BENCHMARK = '#8a8a8a';
export const NPS_COLOURS = { detractor: '#b42332', passive: '#8a8a8a', promoter: '#1f7a3a' } as const;
/** Light → dark brand steps; text is ink on the first three, white on the last two. */
export const SEQUENTIAL = ['#ecebfb', '#c4c1f2', '#8c85e3', '#5148d2', '#1108bf'];
export const INK = '#111111';
export const MUTED = '#666666';
export const GRID = '#e5e5e5';

/** Heat step (0–4) for a value within [min, max]; null → no colour. */
export function heatStep(value: number | null, min: number, max: number): number | null {
  if (value === null) return null;
  if (max <= min) return 2;
  return Math.min(4, Math.max(0, Math.floor(((value - min) / (max - min)) * 5)));
}
