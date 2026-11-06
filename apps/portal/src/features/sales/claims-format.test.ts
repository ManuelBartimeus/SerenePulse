import { describe, expect, it } from 'vitest';
import {
  claimActions,
  claimOverdue,
  claimStatus,
  claimTabStatuses,
  documentChecklist,
  documentsCompleteAt,
  workingDaysBetween,
} from './claims-format';

const docs = [
  { kind: 'police_report', label: 'Police report', required: true },
  { kind: 'claim_photos', label: 'Photos', required: true },
  { kind: 'towing_receipt', label: 'Towing', required: false },
];

describe('claims', () => {
  it('uses plain status names and maps the New tab to received claims', () => {
    expect(claimStatus('received').label).toBe('New');
    expect(claimStatus('settled').label).toBe('Paid');
    expect(claimTabStatuses('new')).toEqual(['received']);
    expect(claimTabStatuses('all')).toEqual([]);
  });
  it('counts working days, skipping weekends and holidays', () => {
    expect(workingDaysBetween('2026-11-06T10:00:00Z', '2026-11-09T09:00:00Z')).toBe(1);
    expect(workingDaysBetween('2026-11-02T10:00:00Z', '2026-11-09T10:00:00Z')).toBe(5);
    expect(workingDaysBetween('2026-12-24T10:00:00Z', '2026-12-29T10:00:00Z', new Set(['2026-12-25']))).toBe(
      2,
    );
    expect(workingDaysBetween('2026-11-09T10:00:00Z', '2026-11-02T10:00:00Z')).toBe(0);
  });
  it('lists present and missing documents', () => {
    const c = documentChecklist(docs, [{ kind: 'claim_photos', created_at: '2026-11-02T10:00:00Z' }]);
    expect(c.map((d) => d.present)).toEqual([false, true, false]);
  });
  it('knows when the last required document arrived', () => {
    const files = [
      { kind: 'claim_photos', created_at: '2026-11-02T10:00:00Z' },
      { kind: 'police_report', created_at: '2026-11-03T10:00:00Z' },
    ];
    expect(documentsCompleteAt(docs, files, '2026-11-01T09:00:00Z')).toBe('2026-11-03T10:00:00Z');
    expect(documentsCompleteAt(docs, files.slice(0, 1), '2026-11-01T09:00:00Z')).toBeNull();
    expect(documentsCompleteAt([], [], '2026-11-01T09:00:00Z')).toBe('2026-11-01T09:00:00Z');
  });
  it('flags claims with all documents for more than 5 working days and no decision', () => {
    const now = new Date('2026-11-11T12:00:00Z');
    expect(claimOverdue('under_review', '2026-11-03T10:00:00Z', now)).toBe(true);
    expect(claimOverdue('under_review', '2026-11-05T10:00:00Z', now)).toBe(false);
    expect(claimOverdue('approved', '2026-11-03T10:00:00Z', now)).toBe(false);
    expect(claimOverdue('received', null, now)).toBe(false);
  });
  it('offers only the next sensible actions', () => {
    expect(claimActions('received').map((a) => a.label)).toEqual(['Start assessing']);
    expect(claimActions('under_review').map((a) => a.to)).toEqual(['info_requested', 'approved', 'declined']);
    expect(claimActions('approved').map((a) => a.to)).toEqual(['settled']);
    expect(claimActions('settled')).toEqual([]);
  });
});
