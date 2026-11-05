import type { Answers, Definition, Snapshot } from '@serene/survey-engine';

/** Data the server inlines into the survey page for the island (one request renders all five pages). */
export interface BootData {
  sessionId: string;
  /** 1-based page the session is on (resume, FR-33). */
  page: number;
  answers: Answers;
  seq: number;
  isNew: boolean;
  versionId: string;
  definition: Definition;
  snapshot: Snapshot;
  turnstileSiteKey: string;
}

/** Answers that never go into the server draft: contact details are stored only, encrypted, at submit (Rule 12). */
export const LOCAL_ONLY = ['phone', 'first_name'] as const;

export const API = {
  answers: '/customerfeedback/api/v1/survey/answers',
  events: '/customerfeedback/api/v1/survey/events',
  submit: '/customerfeedback/api/v1/survey/submit',
};

export const STORAGE_KEY = 'serene-survey';

export interface SubmitBody {
  answers: Answers;
  turnstileToken?: string;
  /** Set by the client when the Turnstile script or challenge could not run (outage). */
  turnstile?: 'unavailable';
}
