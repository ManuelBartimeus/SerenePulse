// TanStack Query keys and fetchers for the account API.
import type {
  CustomerProfile,
  OtpStartRequest,
  OtpStartResponse,
  OtpVerifyRequest,
  OtpVerifyResponse,
  Payment,
  PolicyDetail,
  PolicySummary,
  ProposalFile,
  ProposalSummary,
  Quote,
  SaveDraftRequest,
  StartPaymentRequest,
  SubmitRequest,
  CreateProposalRequest,
  ClaimDetail,
  ClaimSummary,
  CreateClaimRequest,
} from '@serene/proposals';
import { queryOptions } from '@tanstack/react-query';
import { api, upload, type RequestOptions } from './client';
import type { ProposalWithEvents } from './types';

export const keys = {
  me: ['me'] as const,
  proposals: ['proposals'] as const,
  proposal: (id: string) => ['proposals', id] as const,
  policies: ['policies'] as const,
  policy: (id: string) => ['policies', id] as const,
  payment: (ref: string) => ['payments', ref] as const,
  claims: ['claims'] as const,
  claim: (id: string) => ['claims', id] as const,
};

export const claimsQuery = queryOptions({
  queryKey: keys.claims,
  queryFn: () => api<ClaimSummary[]>('GET', '/claims'),
});
export const claimQuery = (id: string) =>
  queryOptions({
    queryKey: keys.claim(id),
    queryFn: () => api<ClaimDetail>('GET', `/claims/${encodeURIComponent(id)}`),
  });

export const meQuery = queryOptions({
  queryKey: keys.me,
  queryFn: () => api<CustomerProfile>('GET', '/me'),
  staleTime: 5 * 60_000,
  retry: false,
});
export const proposalsQuery = queryOptions({
  queryKey: keys.proposals,
  queryFn: () => api<ProposalSummary[]>('GET', '/proposals'),
});
export const proposalQuery = (id: string) =>
  queryOptions({
    queryKey: keys.proposal(id),
    queryFn: () => api<ProposalWithEvents>('GET', `/proposals/${encodeURIComponent(id)}`),
  });
export const policiesQuery = queryOptions({
  queryKey: keys.policies,
  queryFn: () => api<PolicySummary[]>('GET', '/policies'),
});
export const policyQuery = (id: string) =>
  queryOptions({
    queryKey: keys.policy(id),
    queryFn: () => api<PolicyDetail>('GET', `/policies/${encodeURIComponent(id)}`),
  });

export type PaymentWithPolicy = Payment & { policyId?: string };

const p = (id: string) => `/proposals/${encodeURIComponent(id)}`;

export const accountApi = {
  otpStart: (req: OtpStartRequest) => api<OtpStartResponse>('POST', '/otp/start', req),
  otpVerify: (req: OtpVerifyRequest) => api<OtpVerifyResponse>('POST', '/otp/verify', req),
  signOut: () => api<undefined>('POST', '/sign-out'),
  updateMe: (patch: Partial<CustomerProfile>) => api<CustomerProfile>('PATCH', '/me', patch),
  createProposal: (req: CreateProposalRequest) => api<ProposalWithEvents>('POST', '/proposals', req),
  saveDraft: (id: string, req: SaveDraftRequest, opts?: RequestOptions) =>
    api<ProposalSummary>('PATCH', p(id), req, opts),
  quote: (id: string, signal?: AbortSignal) =>
    api<Quote>('POST', `${p(id)}/quote`, undefined, signal ? { signal } : {}),
  uploadFile: (id: string, form: FormData, onProgress: (f: number) => void, signal?: AbortSignal) =>
    upload<ProposalFile>(`${p(id)}/files`, form, onProgress, signal),
  deleteFile: (id: string, fileId: string) =>
    api<undefined>('DELETE', `${p(id)}/files/${encodeURIComponent(fileId)}`),
  submit: (id: string, req: SubmitRequest) => api<ProposalWithEvents>('POST', `${p(id)}/submit`, req),
  cancel: (id: string) => api<ProposalSummary>('POST', `${p(id)}/cancel`),
  startPayment: (id: string, req: StartPaymentRequest) => api<Payment>('POST', `${p(id)}/payments`, req),
  payment: (ref: string) => api<PaymentWithPolicy>('GET', `/payments/${encodeURIComponent(ref)}`),
  simulatePayment: (ref: string, approve: boolean) =>
    api<PaymentWithPolicy>('POST', `/payments/${encodeURIComponent(ref)}/simulate`, { approve }),
  proposalDocument: (id: string) => api<unknown>('GET', `${p(id)}/document`),
  renew: (policyId: string) =>
    api<ProposalWithEvents>('POST', `/policies/${encodeURIComponent(policyId)}/renew`),
  createClaim: (policyId: string, req: CreateClaimRequest) =>
    api<ClaimDetail>('POST', `/policies/${encodeURIComponent(policyId)}/claims`, req),
  uploadClaimFile: (claimId: string, form: FormData, onProgress: (f: number) => void, signal?: AbortSignal) =>
    upload<ClaimDetail['files'][number]>(
      `/claims/${encodeURIComponent(claimId)}/files`,
      form,
      onProgress,
      signal,
    ),
  submitClaim: (claimId: string) => api<ClaimDetail>('POST', `/claims/${encodeURIComponent(claimId)}/submit`),
  deleteClaimFile: (claimId: string, fileId: string) =>
    api<undefined>('DELETE', `/claims/${encodeURIComponent(claimId)}/files/${encodeURIComponent(fileId)}`),
  respondClaim: (claimId: string, message: string) =>
    api<ClaimDetail>('POST', `/claims/${encodeURIComponent(claimId)}/respond`, { message }),
};
