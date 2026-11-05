// S-B19 Survey versions list (M04).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useSession } from '../../../lib/session';
import { PageHeader } from '../../../pages/shell';
import { Alert, Badge, Button, EmptyState } from '../../../ui/controls';
import { ErrorAlert, ListSkeleton, Section, dateTime } from '../shared';
import { STATUS_LABEL, STATUS_TONE, useVersionList } from './data';

export function SurveyVersionsPage() {
  const { supabase, can, claims } = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const versions = useVersionList();
  const list = versions.data ?? [];
  const open = list.find((v) => v.status === 'draft' || v.status === 'pending_approval');
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('survey_version_create_draft');
      if (error) throw error;
      return data as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['survey', 'versions'] });
      navigate({ to: '/config/survey/$versionId', params: { versionId: id } });
    },
  });
  const canEdit = can('survey.edit');
  const awaitingMe =
    can('survey.publish.approve') && open?.status === 'pending_approval' && open.prepared_by !== claims?.sub;
  return (
    <>
      <PageHeader
        title="Survey versions"
        subtitle="Published versions never change. Edit a draft, preview it, then a second person approves it."
        actions={
          canEdit &&
          !open && (
            <Button busy={create.isPending} onClick={() => create.mutate()}>
              Start a new draft
            </Button>
          )
        }
      />
      {create.error && (
        <div className="mb-4">
          <ErrorAlert error={create.error} />
        </div>
      )}
      {awaitingMe && open && (
        <div className="mb-4">
          <Alert tone="warning" title={`Version ${open.version_no} is waiting for your approval`}>
            <Link
              to="/config/survey/$versionId"
              params={{ versionId: open.id }}
              className="font-medium underline"
            >
              Review version {open.version_no}
            </Link>
          </Alert>
        </div>
      )}
      <Section
        title="Versions"
        description="Responses always stay linked to the version the customer answered. Only one draft can be open at a time."
      >
        {versions.isPending ? (
          <ListSkeleton label="Loading survey versions" />
        ) : versions.isError ? (
          <div className="p-4">
            <ErrorAlert error={versions.error} />
          </div>
        ) : list.length === 0 ? (
          <EmptyState title="No survey versions yet" />
        ) : (
          <ul className="divide-y divide-border">
            {list.map((v) => (
              <li key={v.id}>
                <Link
                  to="/config/survey/$versionId"
                  params={{ versionId: v.id }}
                  className="grid gap-2 px-4 py-3 hover:bg-surface-muted md:grid-cols-[140px_180px_1fr_1fr] md:items-center"
                >
                  <span className="font-medium">Version {v.version_no}</span>
                  <span>
                    <Badge tone={STATUS_TONE[v.status]}>{STATUS_LABEL[v.status]}</Badge>
                  </span>
                  <span className="text-[14px] leading-5 text-secondary">
                    {v.published_at
                      ? `Published ${dateTime.format(new Date(v.published_at))}`
                      : v.requested_at
                        ? `Sent for approval ${dateTime.format(new Date(v.requested_at))}`
                        : `Last edited ${dateTime.format(new Date(v.updated_at))}`}
                    {v.retired_at && ` · retired ${dateTime.format(new Date(v.retired_at))}`}
                    {v.change_note && <span className="block text-ink">{v.change_note}</span>}
                  </span>
                  <span className="text-[14px] leading-5 text-secondary">
                    Prepared by {v.preparer_name ?? (v.prepared_by ? 'a staff member' : 'the system')}
                    {v.approved_by && (
                      <span className="block">Approved by {v.approver_name ?? 'a staff member'}</span>
                    )}
                    {v.status === 'draft' && v.rejection_reason && (
                      <span className="block text-warning">Returned with comments</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
