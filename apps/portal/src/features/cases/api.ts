import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../lib/session';

/** Calls an RPC and throws the PostgREST error (code/message) so toUserError can map it. */
export function useRpc() {
  const { supabase } = useSession();
  return async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw error;
    return data as T;
  };
}

export interface FlagItem {
  id: string;
  response_id: string;
  status: 'open' | 'dismissed' | 'converted';
  reason: string;
  suggested_priority: string;
  created_at: string;
  reviewed_at: string | null;
  dismissal_reason: string | null;
  case_id: string | null;
  case_reference: string | null;
  rule_key: string;
  rule_name: string;
  response_reference: string;
  submitted_at: string;
  csat_score: number;
  nps_score: number;
  contact_consent: boolean;
  branch_name: string | null;
  channel_label: string;
  product_label: string;
  comment_excerpt: string | null;
}
export interface FlagPage {
  items: FlagItem[];
  counts: Record<string, number>;
  next_cursor: string | null;
}

export interface CaseItem {
  id: string;
  reference: string;
  status: string;
  priority: string;
  is_escalated: boolean;
  escalation_level: number;
  branch_id: string | null;
  branch_name: string | null;
  department_id: string | null;
  department_name: string | null;
  assigned_officer_id: string | null;
  officer_name: string | null;
  created_at: string;
  target_resolution_at: string;
  resolved_at: string | null;
  version: number;
  overdue: boolean;
  sla_state: string;
  response_reference: string;
  category_label: string | null;
  description: string;
  source: string;
}
export interface CasePage {
  items: CaseItem[];
  next_cursor: string | null;
}

export interface CaseRow {
  id: string;
  reference: string;
  response_id: string;
  status: string;
  priority: string;
  description: string;
  version: number;
  is_escalated: boolean;
  escalation_level: number;
  escalation_label: string;
  assigned_officer_id: string | null;
  officer_name: string | null;
  department_id: string | null;
  department_name: string | null;
  branch_name: string | null;
  category_id: string | null;
  category_label: string | null;
  has_contact_consent: boolean;
  created_at: string;
  target_resolution_at: string;
  resolved_at: string | null;
  closed_at: string | null;
  resolution_notes: string | null;
  corrective_action: string | null;
  follow_up_outcome: string | null;
  reopen_count: number;
  source: string;
}
export interface CaseDetail {
  case: CaseRow;
  sla: {
    state: string;
    target_working_days: number;
    warning_pct: number;
    elapsed_working_days: number | null;
    remaining_working_days: number | null;
    overdue_working_days: number | null;
  };
  response: ResponseSummary | null;
  flags: { id: string; reason: string; status: string; rule_name: string; created_at: string }[];
  activities: Activity[];
  permissions: { assign: boolean; work: boolean; close: boolean; reopen: boolean; reveal: boolean };
}
export interface ResponseSummary {
  id: string;
  reference: string;
  submitted_at: string;
  csat_score: number;
  ces_score: number;
  nps_score: number;
  nps_class: string;
  branch_status: string;
  branch_name: string | null;
  channel_label: string;
  product_label: string;
  factor_label: string | null;
  source_code: string;
  verification: string;
  contact_consent: boolean;
  comment: string | null;
  other_texts: Record<string, string> | null;
  comment_hidden: boolean;
  text_redacted: boolean;
  contact_masked: string | null;
}
export interface Activity {
  id: number;
  type: string;
  from_value: string | null;
  to_value: string | null;
  body: string | null;
  created_at: string;
  actor_name: string | null;
  mentions: string[];
}
export interface CasePeople {
  people: { user_id: string; display_name: string; department_id: string | null; can_work: boolean }[];
  departments: { id: string; name: string }[];
}

export function useCasePeople(enabled = true) {
  const rpc = useRpc();
  return useQuery({
    queryKey: ['cases', 'people'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: () => rpc<CasePeople>('case_people'),
  });
}

export function useCaseCategories() {
  const { supabase } = useSession();
  return useQuery({
    queryKey: ['cases', 'categories'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('case_categories')
        .select('id, label')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data as { id: string; label: string }[];
    },
  });
}

/** Mutation that invalidates every cases/flags/notifications query on success. */
export function useCaseMutation<A>(fn: (args: A) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['cases'] });
      void qc.invalidateQueries({ queryKey: ['flags'] });
      void qc.invalidateQueries({ queryKey: ['record-case-panel'] });
    },
  });
}
