import type { AnswerValue, Answers, FieldError, FormDefinition, ProposalFile } from '@serene/proposals';
import { createContext, useContext, useEffect, useState } from 'react';

export interface UploadedFile extends ProposalFile {
  /** Local object URL for a thumbnail of a file uploaded in this session. */
  preview?: string;
}

export interface WizardCtx {
  proposalId: string;
  form: FormDefinition;
  answers: Answers;
  set: (key: string, value: AnswerValue | undefined) => void;
  /** Errors to show (only after the customer tried to continue). */
  errors: readonly FieldError[];
  files: ReadonlyMap<string, UploadedFile>;
  addFile: (f: UploadedFile) => void;
  removeFile: (id: string) => void;
  /** Upload endpoint: proposals or claims share the same file UI. */
  upload: (form: FormData, onProgress: (f: number) => void, signal: AbortSignal) => Promise<UploadedFile>;
  remove?: (fileId: string) => Promise<void>;
}

export const WizardContext = createContext<WizardCtx | null>(null);

export function useWizard(): WizardCtx {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error('useWizard outside WizardContext');
  return ctx;
}

export const errorsFor = (errors: readonly FieldError[], id: string) =>
  errors.filter(
    (e) =>
      e.field === id ||
      e.field === `${id}__other` ||
      e.field === `${id}__details` ||
      e.field === `${id}__currency`,
  );

const DESKTOP = '(min-width: 810px) and (pointer: fine)';

/** Desktop with a mouse: searchable combobox instead of the native select. */
export function useDesktop(): boolean {
  const [v, setV] = useState(() => typeof window !== 'undefined' && window.matchMedia(DESKTOP).matches);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const on = () => setV(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return v;
}

export function useMedia(query: string): boolean {
  const [v, setV] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setV(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return v;
}

/** Phones and tablets: offer the camera first. Several signals, as no single one is reliable. */
export function useTouch(): boolean {
  const coarse = useMedia('(pointer: coarse)');
  const anyCoarse = useMedia('(any-pointer: coarse)');
  const noHover = useMedia('(hover: none)');
  const touchPoints = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  return coarse || noHover || (anyCoarse && touchPoints);
}
