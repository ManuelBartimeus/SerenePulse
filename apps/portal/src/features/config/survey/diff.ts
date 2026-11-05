// Definition diff (M04 "diff vs previous"): what a reviewer needs to see before approving.
import { pageOf, questions, scaleSignature, type Definition, type Question } from '@serene/survey-engine';

export interface DiffEntry {
  kind: 'added' | 'removed' | 'changed';
  /** Question id, `page:<n>` or `intro`. */
  target: string;
  field?: string;
  before?: string;
  after?: string;
}

const QUESTION_FIELDS: (keyof Question)[] = [
  'type',
  'label',
  'help',
  'anchors',
  'required',
  'visible_when',
  'max_length',
  'options_source',
];

function show(v: unknown): string {
  if (v === undefined) return '(none)';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function diffDefinitions(base: Definition | null, next: Definition): DiffEntry[] {
  if (!base) return [{ kind: 'added', target: 'survey', after: 'First version' }];
  const out: DiffEntry[] = [];
  if (base.intro !== next.intro)
    out.push({ kind: 'changed', target: 'intro', field: 'intro', before: base.intro, after: next.intro });
  const pages = Math.max(base.pages.length, next.pages.length);
  for (let i = 0; i < pages; i++) {
    const a = base.pages[i];
    const b = next.pages[i];
    const target = `page:${i + 1}`;
    if (!a && b) out.push({ kind: 'added', target, after: b.title });
    else if (a && !b) out.push({ kind: 'removed', target, before: a.title });
    else if (a && b) {
      if (a.title !== b.title)
        out.push({ kind: 'changed', target, field: 'title', before: a.title, after: b.title });
      if (!same(a.title_when_low_csat, b.title_when_low_csat))
        out.push({
          kind: 'changed',
          target,
          field: 'title_when_low_csat',
          before: show(a.title_when_low_csat),
          after: show(b.title_when_low_csat),
        });
    }
  }
  const before = new Map(questions(base).map((q) => [q.id, q]));
  const after = new Map(questions(next).map((q) => [q.id, q]));
  for (const [id, q] of after) {
    const old = before.get(id);
    if (!old) {
      out.push({ kind: 'added', target: id, after: q.label });
      continue;
    }
    const pa = pageOf(base, id);
    const pb = pageOf(next, id);
    if (pa !== pb)
      out.push({
        kind: 'changed',
        target: id,
        field: 'page',
        before: `Page ${pa + 1}`,
        after: `Page ${pb + 1}`,
      });
    const orderA = base.pages[pa]?.questions.findIndex((x) => x.id === id);
    const orderB = next.pages[pb]?.questions.findIndex((x) => x.id === id);
    if (pa === pb && orderA !== orderB)
      out.push({
        kind: 'changed',
        target: id,
        field: 'position',
        before: `#${(orderA ?? 0) + 1}`,
        after: `#${(orderB ?? 0) + 1}`,
      });
    for (const f of QUESTION_FIELDS) {
      if (!same(old[f], q[f]))
        out.push({ kind: 'changed', target: id, field: f, before: show(old[f]), after: show(q[f]) });
    }
  }
  for (const [id, q] of before) {
    if (!after.has(id)) out.push({ kind: 'removed', target: id, before: q.label });
  }
  return out;
}

/** True when rating scales differ, so trends break at the publish date (Rule 6). */
export function scaleChanged(base: Definition | null, next: Definition): boolean {
  if (!base) return false;
  const sorted = (d: Definition) => Object.entries(scaleSignature(d)).sort(([a], [b]) => a.localeCompare(b));
  return !same(sorted(base), sorted(next));
}
