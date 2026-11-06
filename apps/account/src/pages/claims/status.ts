import type { ClaimStatus } from '@serene/proposals';

export function claimTone(s: ClaimStatus): string {
  switch (s) {
    case 'info_requested':
      return 'warning';
    case 'approved':
    case 'settled':
      return 'success';
    case 'declined':
      return 'danger';
    case 'withdrawn':
    case 'draft':
      return 'neutral';
    default:
      return 'info';
  }
}

/** The happy path shown as the visual timeline. */
export const CLAIM_PATH: readonly ClaimStatus[] = ['received', 'under_review', 'approved', 'settled'];

export const CLAIM_PRINCIPLE =
  'We aim to settle every claim within one week of receiving your last document.';
