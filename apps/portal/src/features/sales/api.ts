// Data access for the sales pages (customers, proposals, policies, payments, products & rates).
//
// Staff read through security_invoker views in `public` (RLS on the `sales` tables applies to the
// signed-in staff member; supabase/migrations/202611130004_sales_staff.sql) and change things only
// through the audited public.staff_* functions. Every view and function name the portal uses is
// listed in SALES below, so the portal can be lined up with the database in one place.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CertificateData, Quote, ProposalStatus } from '@serene/proposals';
import { useSession } from '../../lib/session';
import type { Supabase } from '../../lib/supabase';

export const SALES = {
  /** Staff read views in public (one row per record, with the customer's name joined in). */
  views: {
    customers: 'sales_customer_list',
    proposals: 'sales_proposal_queue',
    policies: 'sales_policy_list',
    payments: 'sales_payment_list',
    proposalEvents: 'sales_proposal_events',
    proposalFiles: 'sales_proposal_files',
  },
  rpc: {
    review: 'staff_review_proposal',
    quote: 'staff_quote_proposal',
    requestInfo: 'staff_request_info',
    decline: 'staff_decline',
    cancelProposal: 'staff_cancel_proposal',
    cancelPolicy: 'staff_cancel_policy',
    updateSettings: 'staff_update_sales_settings',
    setIdentity: 'staff_set_identity_status',
  },
  bucket: 'customer-files',
  /**
   * Folder for the certificate signature images. Each upload gets a new versioned name and is never
   * overwritten, so certificates issued earlier keep the signature they were issued with.
   */
  signatureFolder: 'settings',
} as const;

/** Settings keys used by online sales (public.settings). */
export const SALES_SETTING_KEYS = [
  'sales_rates',
  'sales_tppd_limit',
  'sales_sms_mode',
  'sales_sms_sender_id',
  'sales_payment_mode',
  'sales_certificate_series',
  'sales_certificate_signatory_title',
  'sales_certificate_signature_path',
  'sales_quote_validity_days',
] as const;
export type SalesSettingKey = (typeof SALES_SETTING_KEYS)[number];

// ---- Row shapes (snake_case, as the database returns them) ---------------------------------

export type IdentityStatus = 'unverified' | 'pending' | 'verified' | 'mismatch';

export interface CustomerRow {
  id: string;
  customer_no: string;
  phone_e164: string;
  title?: string | null;
  full_name: string | null;
  email: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  postal_address?: string | null;
  residential_address?: string | null;
  digital_address?: string | null;
  occupation?: string | null;
  employer?: string | null;
  id_type?: string | null;
  id_number?: string | null;
  nationality?: string | null;
  tin?: string | null;
  company_name?: string | null;
  company_reg_no?: string | null;
  marketing_consent?: boolean | null;
  status?: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  /** Identity check against NIA (L.I. 2523: no Ghana Card images are requested or kept). */
  identity_status?: IdentityStatus | null;
  identity_checked_by?: string | null;
  identity_checked_by_name?: string | null;
  identity_checked_at?: string | null;
  identity_note?: string | null;
  identity_reference?: string | null;
  policy_count?: number | null;
  proposal_count?: number | null;
  total_premium?: number | null;
}

export interface ProposalRow {
  id: string;
  proposal_no: string;
  customer_id: string;
  customer_name?: string | null;
  customer_no?: string | null;
  customer_phone?: string | null;
  product_code: string;
  form_id: string;
  form_version: number;
  status: ProposalStatus;
  answers?: Record<string, unknown> | null;
  current_step?: number | null;
  quote?: Quote | null;
  premium?: number | null;
  sum_insured?: number | null;
  cover_start?: string | null;
  cover_end?: string | null;
  insured_subject?: string | null;
  confirmations?: string[] | null;
  signature?: {
    method?: string;
    signedName?: string;
    signedAt?: string;
    ip?: string;
    userAgent?: string;
    clientSignedAt?: string;
    answersSha256?: string;
    imagePath?: string;
  } | null;
  submitted_at?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  staff_message?: string | null;
  policy_id?: string | null;
  file_count?: number | null;
  total?: number | null;
  quote_valid_until?: string | null;
  refer_reasons?: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface ProposalEvent {
  id: string | number;
  proposal_id: string;
  at: string;
  event: string | null;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  actor_type: string | null;
  actor_name: string | null;
}

export interface ProposalFileRow {
  id: string;
  proposal_id: string;
  customer_id: string;
  field_id: string;
  kind: string;
  storage_path: string;
  mime: string;
  size: number;
  original_name: string | null;
  created_at: string;
}

export interface PolicyRow {
  id: string;
  policy_no: string;
  certificate_no: string;
  customer_id: string;
  customer_name?: string | null;
  customer_no?: string | null;
  proposal_id: string;
  proposal_no?: string | null;
  payment_id?: string | null;
  product_code: string;
  cover_title: string;
  insured_subject: string | null;
  starts_on: string;
  expires_on: string;
  premium: number;
  sum_insured?: number | null;
  certificate?: CertificateData | null;
  /** Signature image in force when the policy was issued (frozen at issue; null = none uploaded then). */
  signature_path?: string | null;
  status: 'active' | 'expired' | 'cancelled' | string;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  issued_at: string;
}

export interface PaymentRow {
  id: string;
  reference: string;
  proposal_id: string;
  proposal_no?: string | null;
  customer_id: string;
  customer_name?: string | null;
  amount: number;
  method: 'momo' | 'card' | string;
  network?: string | null;
  masked_account: string | null;
  provider?: string | null;
  status: 'pending' | 'succeeded' | 'failed' | string;
  failure_reason?: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface SettingRow {
  key: string;
  value: unknown;
  description?: string;
  updated_at: string;
}

// ---- Low-level helpers -------------------------------------------------------------------

async function rows<T>(
  q: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>,
): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as T[];
}

async function single<T>(
  q: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>,
): Promise<T | null> {
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? null) as T | null;
}

/** A missing view/table/function (backend not migrated yet) instead of a real failure. */
export function isMissingObject(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return (
    !!e &&
    (e.code === '42P01' ||
      e.code === 'PGRST205' ||
      e.code === 'PGRST202' ||
      e.code === '42883' ||
      e.code === 'PGRST106' ||
      /does not exist|could not find|schema must be one of/i.test(e.message ?? ''))
  );
}

// ---- Queries -----------------------------------------------------------------------------

export function useCustomers() {
  const { supabase } = useSession();
  return useQuery({
    queryKey: ['sales', 'customers'],
    queryFn: () =>
      rows<CustomerRow>(
        supabase
          .from(SALES.views.customers)
          .select('*')
          .order('created_at', { ascending: false })
          .limit(2000),
      ),
  });
}

export function useCustomer(id: string) {
  const { supabase } = useSession();
  return useQuery({
    queryKey: ['sales', 'customer', id],
    queryFn: () =>
      single<CustomerRow>(supabase.from(SALES.views.customers).select('*').eq('id', id).maybeSingle()),
  });
}

export interface ProposalFilter {
  statuses?: readonly ProposalStatus[] | undefined;
  product?: string | undefined;
  from?: string | undefined; // YYYY-MM-DD, on updated_at
  to?: string | undefined;
  customerId?: string | undefined;
}

/** Columns for lists (answers, quote and signature are only loaded on the detail page). */
const PROPOSAL_LIST_COLUMNS =
  'id, proposal_no, customer_id, customer_name, customer_no, product_code, form_id, status, premium, total, insured_subject, submitted_at, created_at, updated_at, file_count';

export function useProposals(filter: ProposalFilter) {
  const { supabase } = useSession();
  return useQuery({
    queryKey: ['sales', 'proposals', filter],
    queryFn: () => {
      let q = supabase
        .from(SALES.views.proposals)
        .select(PROPOSAL_LIST_COLUMNS)
        .order('updated_at', { ascending: false })
        .limit(1000);
      if (filter.statuses?.length) q = q.in('status', [...filter.statuses]);
      if (filter.product) q = q.eq('product_code', filter.product);
      if (filter.customerId) q = q.eq('customer_id', filter.customerId);
      if (filter.from) q = q.gte('updated_at', `${filter.from}T00:00:00Z`);
      if (filter.to) q = q.lte('updated_at', `${filter.to}T23:59:59.999Z`);
      return rows<ProposalRow>(q);
    },
  });
}

export function useProposal(id: string) {
  const { supabase } = useSession();
  return useQuery({
    queryKey: ['sales', 'proposal', id],
    queryFn: () =>
      single<ProposalRow>(supabase.from(SALES.views.proposals).select('*').eq('id', id).maybeSingle()),
  });
}

export function useProposalEvents(proposalId: string) {
  const { supabase } = useSession();
  return useQuery({
    queryKey: ['sales', 'proposal-events', proposalId],
    queryFn: () =>
      rows<ProposalEvent>(
        supabase
          .from(SALES.views.proposalEvents)
          .select('*')
          .eq('proposal_id', proposalId)
          .order('at', { ascending: true }),
      ),
  });
}

export function useProposalFiles(filter: { proposalId?: string; customerId?: string }) {
  const { supabase } = useSession();
  return useQuery({
    queryKey: ['sales', 'files', filter],
    queryFn: () => {
      let q = supabase.from(SALES.views.proposalFiles).select('*').order('created_at', { ascending: true });
      if (filter.proposalId) q = q.eq('proposal_id', filter.proposalId);
      if (filter.customerId) q = q.eq('customer_id', filter.customerId);
      return rows<ProposalFileRow>(q);
    },
  });
}

export function usePolicies(filter: { customerId?: string } = {}) {
  const { supabase } = useSession();
  return useQuery({
    queryKey: ['sales', 'policies', filter],
    queryFn: () => {
      let q = supabase
        .from(SALES.views.policies)
        .select(
          'id, policy_no, certificate_no, customer_id, customer_name, customer_no, proposal_id, product_code, cover_title, insured_subject, starts_on, expires_on, premium, status, issued_at',
        )
        .order('issued_at', { ascending: false })
        .limit(2000);
      if (filter.customerId) q = q.eq('customer_id', filter.customerId);
      return rows<PolicyRow>(q);
    },
  });
}

export function usePolicy(id: string) {
  const { supabase } = useSession();
  return useQuery({
    queryKey: ['sales', 'policy', id],
    queryFn: () =>
      single<PolicyRow>(supabase.from(SALES.views.policies).select('*').eq('id', id).maybeSingle()),
  });
}

export function usePayments(
  filter: { customerId?: string | undefined; from?: string | undefined; to?: string | undefined } = {},
) {
  const { supabase } = useSession();
  return useQuery({
    queryKey: ['sales', 'payments', filter],
    queryFn: () => {
      let q = supabase
        .from(SALES.views.payments)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(2000);
      if (filter.customerId) q = q.eq('customer_id', filter.customerId);
      if (filter.from) q = q.gte('created_at', `${filter.from}T00:00:00Z`);
      if (filter.to) q = q.lte('created_at', `${filter.to}T23:59:59.999Z`);
      return rows<PaymentRow>(q);
    },
  });
}

export function useSalesSettings() {
  const { supabase } = useSession();
  return useQuery({
    queryKey: ['sales', 'settings'],
    queryFn: async () => {
      const list = await rows<SettingRow>(
        supabase
          .from('settings')
          .select('key, value, description, updated_at')
          .in('key', [...SALES_SETTING_KEYS]),
      );
      return Object.fromEntries(list.map((r) => [r.key, r])) as Partial<Record<SalesSettingKey, SettingRow>>;
    },
  });
}

// ---- Storage -------------------------------------------------------------------------------

/** A short-lived link to a private file (customer documents, signatures). */
export async function signedUrl(supabase: Supabase, path: string, download?: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(SALES.bucket)
    .createSignedUrl(path, 300, download ? { download } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

export function useSignedUrl(path: string | null | undefined) {
  const { supabase } = useSession();
  return useQuery({
    queryKey: ['sales', 'signed', path],
    enabled: !!path,
    staleTime: 240_000,
    queryFn: () => signedUrl(supabase, path ?? ''),
  });
}

export async function downloadBytes(supabase: Supabase, path: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from(SALES.bucket).download(path);
  if (error) throw error;
  return new Uint8Array(await data.arrayBuffer());
}

// ---- Staff actions -----------------------------------------------------------------------

async function callRpc(supabase: Supabase, fn: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as unknown;
}

export interface QuoteInput {
  premium: number;
  lines: { label: string; amount: number }[];
  taxes: { label: string; amount: number }[];
  validityDays: number;
  note: string;
}

/** Proposal and policy actions; each refreshes the sales lists afterwards. */
export function useSalesAction() {
  const { supabase } = useSession();
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ['sales'] });
  const m = <A>(fn: (a: A) => Promise<unknown>) => useMutation({ mutationFn: fn, onSuccess: done });
  return {
    review: m((id: string) => callRpc(supabase, SALES.rpc.review, { p_proposal_id: id })),
    quote: m((a: { id: string } & QuoteInput) =>
      callRpc(supabase, SALES.rpc.quote, {
        p_proposal_id: a.id,
        p_premium: a.premium,
        p_lines: a.lines,
        p_taxes: a.taxes,
        p_valid_days: a.validityDays,
        p_note: a.note || null,
      }),
    ),
    requestInfo: m((a: { id: string; message: string }) =>
      callRpc(supabase, SALES.rpc.requestInfo, { p_proposal_id: a.id, p_message: a.message }),
    ),
    decline: m((a: { id: string; reason: string }) =>
      callRpc(supabase, SALES.rpc.decline, { p_proposal_id: a.id, p_message: a.reason }),
    ),
    cancelProposal: m((a: { id: string; reason: string }) =>
      callRpc(supabase, SALES.rpc.cancelProposal, { p_proposal_id: a.id, p_reason: a.reason }),
    ),
    cancelPolicy: m((a: { id: string; reason: string }) =>
      callRpc(supabase, SALES.rpc.cancelPolicy, { p_policy_id: a.id, p_reason: a.reason }),
    ),
    setIdentity: m((a: { customerId: string; status: IdentityStatus; reference?: string; note?: string }) =>
      callRpc(supabase, SALES.rpc.setIdentity, {
        p_customer_id: a.customerId,
        p_status: a.status,
        p_reference: a.reference ?? null,
        p_note: a.note ?? null,
      }),
    ),
  };
}

export function useUpdateSalesSettings() {
  const { supabase } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: Partial<Record<SalesSettingKey, unknown>>) =>
      callRpc(supabase, SALES.rpc.updateSettings, { p_settings: values }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales', 'settings'] }),
  });
}

/** Uploads the certificate signature image (PNG or JPG) and returns its storage path. */
export async function uploadSignature(supabase: Supabase, file: File): Promise<string> {
  const ext = file.type === 'image/png' ? 'png' : 'jpg';
  const path = `${SALES.signatureFolder}/signature-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(SALES.bucket)
    .upload(path, file, { upsert: false, contentType: file.type, cacheControl: '31536000' });
  if (error) throw error;
  return path;
}

// ---- Claims (supabase/migrations/202611130005_sales_claims_renewal.sql) ---------------------

export const CLAIMS = {
  views: { list: 'sales_claim_list', events: 'sales_claim_events', files: 'sales_claim_files' },
  rpc: { update: 'staff_update_claim' },
} as const;

export interface ClaimRow {
  id: string;
  claim_no: string;
  policy_id: string;
  policy_no: string | null;
  product_code: string | null;
  customer_id: string;
  customer_no: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  claim_type: string;
  status: string;
  incident_date: string;
  incident_location: string;
  description: string;
  estimated_amount: number | null;
  third_party: { name?: string; phone?: string; vehicleReg?: string } | null;
  staff_message: string | null;
  assigned_to: string | null;
  created_at: string;
  submitted_at: string | null;
  updated_at: string;
  file_count: number | null;
}

export interface ClaimFileRow {
  id: string;
  claim_id: string;
  customer_id: string;
  kind: string;
  storage_path: string;
  mime: string;
  size: number;
  original_name: string;
  created_at: string;
}

export interface ClaimEvent {
  id: number;
  claim_id: string;
  at: string;
  actor_type: string;
  actor_name: string | null;
  status: string;
  note: string | null;
}

export function useClaims(
  filter: { statuses?: readonly string[]; customerId?: string; policyId?: string } = {},
) {
  const { supabase } = useSession();
  return useQuery({
    queryKey: ['sales', 'claims', filter],
    queryFn: () => {
      // Drafts have not been sent by the customer yet.
      let q = supabase
        .from(CLAIMS.views.list)
        .select('*')
        .neq('status', 'draft')
        .order('submitted_at', { ascending: false })
        .limit(1000);
      if (filter.statuses?.length) q = q.in('status', [...filter.statuses]);
      if (filter.customerId) q = q.eq('customer_id', filter.customerId);
      if (filter.policyId) q = q.eq('policy_id', filter.policyId);
      return rows<ClaimRow>(q);
    },
  });
}

export function useClaim(id: string) {
  const { supabase } = useSession();
  return useQuery({
    queryKey: ['sales', 'claim', id],
    queryFn: () => single<ClaimRow>(supabase.from(CLAIMS.views.list).select('*').eq('id', id).maybeSingle()),
  });
}

/** Files of one claim, or of several (the queue uses them for the one-week check). */
export function useClaimFiles(claimIds: readonly string[]) {
  const { supabase } = useSession();
  return useQuery({
    queryKey: ['sales', 'claim-files', claimIds],
    enabled: claimIds.length > 0,
    queryFn: () =>
      rows<ClaimFileRow>(
        supabase
          .from(CLAIMS.views.files)
          .select('*')
          .in('claim_id', [...claimIds].slice(0, 300))
          .order('created_at', { ascending: true }),
      ),
  });
}

export function useClaimEvents(claimId: string) {
  const { supabase } = useSession();
  return useQuery({
    queryKey: ['sales', 'claim-events', claimId],
    queryFn: () =>
      rows<ClaimEvent>(
        supabase
          .from(CLAIMS.views.events)
          .select('*')
          .eq('claim_id', claimId)
          .order('at', { ascending: true }),
      ),
  });
}

export function useUpdateClaim() {
  const { supabase } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { id: string; status: string; message?: string }) =>
      callRpc(supabase, CLAIMS.rpc.update, {
        p_claim_id: a.id,
        p_status: a.status,
        p_message: a.message || null,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales'] }),
  });
}

/** Ghana public holidays (public.holidays), for working-day ages. */
export function useHolidays() {
  const { supabase } = useSession();
  return useQuery({
    queryKey: ['sales', 'holidays'],
    staleTime: 3_600_000,
    queryFn: async () => {
      const list = await rows<{ holiday_date: string }>(supabase.from('holidays').select('holiday_date'));
      return new Set(list.map((h) => h.holiday_date));
    },
  });
}
