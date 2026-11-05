// S-B7/B8 QR points (M05). A QR point records where the survey was opened; it never sets a branch (Rule 2).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '../../lib/session';
import { PageHeader } from '../../pages/shell';
import { Alert, Button, EmptyState, TextField } from '../../ui/controls';
import { Dialog } from '../../ui/dialog';
import { displayLink, qrLink } from './links';
import { PosterDownloads, QrCodeView } from './qr-view';
import {
  ActiveBadge,
  CodeChip,
  ConfirmDialog,
  CopyButton,
  ErrorAlert,
  ListSkeleton,
  Section,
  TextArea,
  dateOnly,
  updateVersioned,
} from './shared';
import { labelError } from './validation';

export interface QrPoint {
  id: string;
  code: string;
  label: string;
  placement_note: string | null;
  is_active: boolean;
  deactivated_at: string | null;
  created_at: string;
  version: number;
}

const RULE_2 =
  'A QR point only records where the survey was opened. It never decides the branch: only the customer’s own answer on Page 1 does.';

function QrPointDialog({ point, onClose }: { point: QrPoint | null; onClose: () => void }) {
  const { supabase } = useSession();
  const qc = useQueryClient();
  const [label, setLabel] = useState(point?.label ?? '');
  const [note, setNote] = useState(point?.placement_note ?? '');
  const [touched, setTouched] = useState(false);
  const errors = {
    label: labelError(label, 80, 'a label'),
    note: note.length > 300 ? 'Keep the placement note to 300 characters or fewer.' : null,
  };
  const save = useMutation({
    mutationFn: async () => {
      const patch = { label: label.trim(), placement_note: note.trim() || null };
      if (point) await updateVersioned(supabase, 'qr_points', point.id, point.version, patch);
      else {
        const { error } = await supabase.from('qr_points').insert(patch);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config', 'qr-points'] });
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={point ? `Rename ${point.code}` : 'Create a QR point'}
      description={point ? undefined : 'The system gives it a short permanent code for the poster.'}
    >
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (!errors.label && !errors.note) save.mutate();
        }}
      >
        {save.error && <ErrorAlert error={save.error} />}
        <TextField
          label="Label"
          value={label}
          maxLength={80}
          onChange={(e) => setLabel(e.target.value)}
          helper="For staff, e.g. “Counter poster, ground floor”. Not printed on the poster."
          error={touched ? (errors.label ?? undefined) : undefined}
        />
        <TextArea
          label="Placement note"
          optional
          value={note}
          maxLength={300}
          onChange={(e) => setNote(e.target.value)}
          helper="Where the poster is displayed, for operations only."
          counter={`${note.length}/300`}
          error={touched ? errors.note : null}
        />
        <Alert tone="info">{RULE_2}</Alert>
        <div className="flex flex-col-reverse gap-3 md:flex-row md:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={save.isPending}>
            {point ? 'Save' : 'Create QR point'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function PosterDialog({ point, onClose }: { point: QrPoint; onClose: () => void }) {
  const { env } = useSession();
  const url = qrLink(env.VITE_SURVEY_URL, point.code);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Poster for ${point.code}`}
      description={point.label}
    >
      <div className="flex flex-col items-center gap-5">
        <QrCodeView url={url} label={`QR code linking to ${displayLink(url)}`} size={220} />
        <p className="break-all text-center font-medium text-brand">{displayLink(url)}</p>
        {!point.is_active && (
          <Alert tone="warning">
            This point is inactive. Its posters still open the survey; scans are reported as “inactive QR”.
          </Alert>
        )}
        <div className="flex w-full flex-wrap justify-center gap-2">
          <CopyButton text={url} label="Copy link" />
        </div>
        <PosterDownloads url={url} code={point.code} filenameBase={`serene-feedback-${point.code}`} />
        <p className="text-[14px] leading-5 text-secondary">
          Posters show the Serene logo, “How did we do? Tell us in under a minute”, the QR code (at least 3
          cm) and the link as text. Print at 100% scale.
        </p>
      </div>
    </Dialog>
  );
}

export function useQrPoints() {
  const { supabase } = useSession();
  return useQuery({
    queryKey: ['config', 'qr-points'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('qr_points')
        .select('id, code, label, placement_note, is_active, deactivated_at, created_at, version')
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as QrPoint[];
    },
  });
}

/** S-B7/B8 QR points. */
export function QrPointsPage() {
  const { supabase, can, env } = useSession();
  const qc = useQueryClient();
  const canEdit = can('config.qr_points');
  const points = useQrPoints();
  const [editing, setEditing] = useState<QrPoint | 'new' | null>(null);
  const [poster, setPoster] = useState<QrPoint | null>(null);
  const [toggling, setToggling] = useState<QrPoint | null>(null);
  const [query, setQuery] = useState('');
  const setActive = useMutation({
    mutationFn: (p: QrPoint) =>
      updateVersioned(supabase, 'qr_points', p.id, p.version, { is_active: !p.is_active }),
    onSuccess: () => {
      setToggling(null);
      qc.invalidateQueries({ queryKey: ['config', 'qr-points'] });
    },
  });
  const q = query.trim().toLowerCase();
  const list = (points.data ?? []).filter(
    (p) =>
      !q ||
      p.code.toLowerCase().includes(q) ||
      p.label.toLowerCase().includes(q) ||
      (p.placement_note ?? '').toLowerCase().includes(q),
  );
  return (
    <>
      <PageHeader
        title="QR points"
        subtitle="Each poster has its own code, so you can see where surveys are opened."
        actions={canEdit && <Button onClick={() => setEditing('new')}>Create QR point</Button>}
      />
      <div className="mb-4">
        <Alert tone="info" title="Posters never set the branch">
          {RULE_2} Dashboards show QR points as “where the survey was opened”, never as branch performance.
        </Alert>
      </div>
      <Section
        title="All QR points"
        description="Inactive points stay listed. Their posters still open the survey, and scans are reported as “inactive QR”."
      >
        <div className="border-b border-border p-4">
          <div className="max-w-sm">
            <TextField
              label="Search"
              placeholder="Code, label or placement"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        {setActive.error && !toggling && (
          <div className="p-4">
            <ErrorAlert error={setActive.error} />
          </div>
        )}
        {points.isPending ? (
          <ListSkeleton label="Loading QR points" />
        ) : points.isError ? (
          <div className="p-4">
            <ErrorAlert error={points.error} />
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            title={q ? 'No QR points match your search' : 'No QR points yet'}
            action={!q && canEdit && <Button onClick={() => setEditing('new')}>Create QR point</Button>}
          >
            {!q && 'Create one for each poster location, then download and print its poster.'}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((p) => (
              <li key={p.id} className="grid gap-3 px-4 py-3 md:grid-cols-[120px_1fr_auto] md:items-center">
                <span className="flex items-center gap-2 md:block">
                  <CodeChip code={p.code} />
                  <span className="md:mt-1 md:block">
                    <ActiveBadge active={p.is_active} />
                  </span>
                </span>
                <span>
                  <span className="block font-medium">{p.label}</span>
                  {p.placement_note && (
                    <span className="block text-[14px] text-secondary">{p.placement_note}</span>
                  )}
                  <span className="block text-[12px] leading-4 text-muted">
                    Created {dateOnly.format(new Date(p.created_at))}
                    {p.deactivated_at &&
                      ` · deactivated ${dateOnly.format(new Date(p.deactivated_at))}`} ·{' '}
                    {displayLink(qrLink(env.VITE_SURVEY_URL, p.code))}
                  </span>
                </span>
                <span className="flex flex-wrap gap-2">
                  <Button variant="secondary" className="h-11 px-4 text-[14px]" onClick={() => setPoster(p)}>
                    Poster<span className="sr-only"> for {p.code}</span>
                  </Button>
                  {canEdit && (
                    <>
                      <Button variant="ghost" className="h-11 px-4 text-[14px]" onClick={() => setEditing(p)}>
                        Rename<span className="sr-only"> {p.code}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-11 px-4 text-[14px]"
                        onClick={() => {
                          setActive.reset();
                          setToggling(p);
                        }}
                      >
                        {p.is_active ? 'Deactivate' : 'Reactivate'}
                        <span className="sr-only"> {p.code}</span>
                      </Button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {editing && (
        <QrPointDialog point={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
      {poster && <PosterDialog point={poster} onClose={() => setPoster(null)} />}
      <ConfirmDialog
        open={!!toggling}
        onOpenChange={(o) => !o && setToggling(null)}
        title={toggling?.is_active ? `Deactivate ${toggling.code}?` : `Reactivate ${toggling?.code ?? ''}?`}
        confirmLabel={toggling?.is_active ? 'Deactivate' : 'Reactivate'}
        tone={toggling?.is_active ? 'danger' : 'primary'}
        busy={setActive.isPending}
        error={setActive.error}
        onConfirm={() => toggling && setActive.mutate(toggling)}
      >
        <p className="text-secondary">
          {toggling?.is_active
            ? 'Scans still work: customers can still give feedback, and the visits are reported as “inactive QR” so you can find posters that should have been taken down.'
            : 'Scans will be reported under this QR point again.'}
        </p>
      </ConfirmDialog>
    </>
  );
}
