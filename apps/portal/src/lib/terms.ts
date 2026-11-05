/**
 * Plain-language names for every measure and concept shown in the portal (user direction,
 * 2026-11-05): professional, but understandable by a non-technical executive. Use these instead of
 * jargon (CSAT, NPS, CES, SLA, n, benchmark, flags/factors …). Each entry has a short label and a
 * one-sentence explanation for tooltips and helper text.
 */
export interface Term {
  label: string;
  explain: string;
}

export const MEASURES = {
  csat_pct: {
    label: 'Satisfied customers',
    explain: 'Share of customers who rated their overall experience good or very good.',
  },
  csat_avg: {
    label: 'Average satisfaction',
    explain: 'The average overall rating customers gave, out of 5.',
  },
  nps: {
    label: 'Recommendation score',
    explain:
      'How many more customers would recommend us than would not, from −100 to +100. Above 0 is good; above 50 is excellent.',
  },
  ces_avg: {
    label: 'Ease of service',
    explain: 'How easy customers found it to get their policy, out of 5 (higher is easier).',
  },
  negative_rate: {
    label: 'Unhappy customers',
    explain: 'Share of customers who rated their overall experience poor or very poor.',
  },
  completion_rate: {
    label: 'Survey completion',
    explain: 'Share of customers who finished the survey after starting it.',
  },
  responses: { label: 'Responses', explain: 'Number of completed surveys in the period.' },
  main_factor: {
    label: 'Top area to improve',
    explain: 'The improvement customers mentioned most often.',
  },
  completion_time: {
    label: 'Time to complete',
    explain: 'How long customers took to finish the survey.',
  },
} as const satisfies Record<string, Term>;

export type MeasureKey = keyof typeof MEASURES;

/** Recommendation groups (NPS classes). */
export const RECOMMEND_GROUPS = {
  promoter: 'Likely to recommend',
  passive: 'Neutral',
  detractor: 'Unlikely to recommend',
} as const;

/** Customer rating bands (satisfaction 1–2 / 3 / 4–5). */
export const RATING_BANDS = {
  positive: 'Satisfied',
  neutral: 'Neutral',
  negative: 'Unhappy',
} as const;

/** Case priorities P1–P4. */
export const PRIORITIES = { P1: 'Urgent', P2: 'High', P3: 'Normal', P4: 'Low' } as const;

/** General vocabulary. */
export const WORDS = {
  records: 'Responses',
  record: 'Response',
  flags: 'Flagged feedback',
  flagRules: 'Flagging rules',
  factors: 'Areas to improve',
  factor: 'Area to improve',
  benchmark: 'Company average',
  vsPrevious: 'vs previous period',
  sla: 'Response deadline',
  slaBreached: 'Past deadline',
  slaWarning: 'Deadline approaching',
  escalated: 'Escalated',
  correction: 'Branch correction',
  catalogues: 'Lists & options',
  surveyVersions: 'Survey questions',
  noData: 'No responses yet',
  fewResponses: 'Too few responses to compare reliably',
} as const;
