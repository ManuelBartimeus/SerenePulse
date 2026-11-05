// Survey-version data access (M04).
import { useQuery } from '@tanstack/react-query';
import type { Definition, Snapshot } from '@serene/survey-engine';
import { useSession } from '../../../lib/session';

export type VersionStatus = 'draft' | 'pending_approval' | 'published' | 'retired';

export interface VersionListItem {
  id: string;
  version_no: number;
  status: VersionStatus;
  change_note: string | null;
  rejection_reason: string | null;
  prepared_by: string | null;
  preparer_name: string | null;
  approved_by: string | null;
  approver_name: string | null;
  requested_at: string | null;
  published_at: string | null;
  retired_at: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface VersionRow {
  id: string;
  version_no: number;
  status: VersionStatus;
  definition: Definition;
  catalogue_snapshot: Snapshot | null;
  change_note: string | null;
  rejection_reason: string | null;
  prepared_by: string | null;
  approved_by: string | null;
  requested_at: string | null;
  published_at: string | null;
  version: number;
}

export const STATUS_LABEL: Record<VersionStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Waiting for approval',
  published: 'Published',
  retired: 'Retired',
};
export const STATUS_TONE = {
  draft: 'info',
  pending_approval: 'warning',
  published: 'success',
  retired: 'neutral',
} as const;

const VERSION_COLUMNS =
  'id, version_no, status, definition, catalogue_snapshot, change_note, rejection_reason, prepared_by, approved_by, requested_at, published_at, version';

export function useVersionList() {
  const { supabase } = useSession();
  return useQuery({
    queryKey: ['survey', 'versions'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('survey_version_list');
      if (error) throw error;
      return data as VersionListItem[];
    },
  });
}

export function useVersion(id: string) {
  const { supabase } = useSession();
  return useQuery({
    queryKey: ['survey', 'version', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('survey_versions')
        .select(VERSION_COLUMNS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw { code: 'P0002', message: 'This survey version doesn’t exist, or you can’t see it.' };
      return data as VersionRow;
    },
  });
}

/** The version a reviewer compares against: the published one for open drafts, else the previous number. */
export function useBaseVersion(row: VersionRow | undefined) {
  const { supabase } = useSession();
  return useQuery({
    queryKey: ['survey', 'base', row?.id, row?.status],
    enabled: !!row,
    queryFn: async () => {
      if (!row) return null;
      const open = row.status === 'draft' || row.status === 'pending_approval';
      const q = supabase.from('survey_versions').select(VERSION_COLUMNS);
      const { data, error } = open
        ? await q.eq('status', 'published').maybeSingle()
        : await q.eq('version_no', row.version_no - 1).maybeSingle();
      if (error) throw error;
      return (data as VersionRow | null) ?? null;
    },
  });
}

/** Live catalogues for previewing a draft (FR-44): what a new session would show if published now. */
export function usePreviewSnapshot(enabled: boolean) {
  const { supabase } = useSession();
  return useQuery({
    queryKey: ['survey', 'preview-snapshot'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('survey_preview_snapshot');
      if (error) throw error;
      return data as Snapshot;
    },
  });
}
