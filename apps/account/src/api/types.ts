import type { ProposalDetail, ProposalStatus } from '@serene/proposals';

/** Internal history entry used by the mock before it is turned into ProposalDetail.history. */
export interface ProposalEvent {
  status: ProposalStatus;
  at: string;
  note?: string;
}

export type ProposalWithEvents = ProposalDetail;
