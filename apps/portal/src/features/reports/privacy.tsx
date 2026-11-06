// S-B Privacy requests (M16, FR-45): find a consented contact by phone, export what is held, erase it.
// Every action is audited by the database; the clear number never appears in the audit trail.
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useSession } from '../../lib/session';
import { AccessDeniedPage, PageHeader } from '../../pages/shell';
import { Alert, Badge, Button, EmptyState, TextField } from '../../ui/controls';
import { Dialog } from '../../ui/dialog';
import { formatDateTime } from './format';
import { ErrorBox, TextArea } from './ui';

interface Contact {
  contact_id: string;
  response_id: string;
  reference: string;
  submitted_at: string;
  consent_text_version: string;
  has_first_name: boolean;
  cases: { id: string; reference: string; status: string }[];
}
interface FindResult {
  phone_masked: string;
  contacts: Contact[];
}

/** pii.view and settings.manage, or an Executive (SPEC M16). The database enforces the same rule. */
export function usePrivacyAccess() {
  const { can, claims } = useSession();
  return can('pii.view') && (can('settings.manage') || (claims?.app_roles.includes('executive') ?? false));
}

function saveJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function PrivacyPage() {
  const allowed = usePrivacyAccess();
  const { supabase } = useSession();
  const [phone, setPhone] = useState('');
  const [searched, setSearched] = useState('');
  const [reason, setReason] = useState('');
  const [erase, setErase] = useState<Contact | null>(null);
  const [eraseReason, setEraseReason] = useState('');

  const find = useMutation({
    mutationFn: async (p: string) => {
      const { data, error } = await supabase.rpc('privacy_find_contact', { p_phone: p });
      if (error) throw error;
      return data as FindResult;
    },
    onSuccess: (_d, p) => setSearched(p),
  });
  const exportData = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('privacy_export_subject', {
        p_phone: searched,
        p_reason: reason.trim(),
      });
      if (error) throw error;
      saveJson(`subject-access-${new Date().toISOString().slice(0, 10)}.json`, data);
    },
  });
  const doErase = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('privacy_erase_contact', {
        p_contact_id: erase?.contact_id,
        p_reason: eraseReason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setErase(null);
      setEraseReason('');
      find.mutate(searched);
    },
  });

  if (!allowed) return <AccessDeniedPage />;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    find.mutate(phone);
  };

  return (
    <>
      <PageHeader
        title="Data-protection requests"
        subtitle="Find what is held for a phone number, give the person a copy, or erase their contact details. Feedback itself stays, without the link to them."
      />
      <section className="rounded-lg bg-white p-4 md:p-6">
        <form onSubmit={submit} className="grid gap-4 md:max-w-md">
          <TextField
            label="Customer's phone number"
            inputMode="tel"
            autoComplete="off"
            value={phone}
            helper="A Ghana mobile number, e.g. 024 123 4567 or +233 24 123 4567."
            onChange={(e) => setPhone(e.target.value)}
          />
          <div>
            <Button type="submit" busy={find.isPending} disabled={!phone.trim()}>
              Find
            </Button>
          </div>
        </form>
        <div aria-live="polite" className="mt-4">
          {find.isError && <ErrorBox error={find.error} />}
        </div>
      </section>

      {find.data && (
        <section className="mt-6 rounded-lg bg-white" aria-labelledby="dsr-results">
          <h2 id="dsr-results" className="border-b border-border p-4 text-[18px] font-medium">
            Responses for {find.data.phone_masked}
          </h2>
          {find.data.contacts.length === 0 ? (
            <EmptyState title="Nothing held for this number">
              No consented contact details match. Erased details can no longer be found.
            </EmptyState>
          ) : (
            <>
              <ul className="divide-y divide-border">
                {find.data.contacts.map((c) => (
                  <li
                    key={c.contact_id}
                    className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="font-medium">
                        {c.reference}{' '}
                        <span className="text-secondary">· {formatDateTime(c.submitted_at)}</span>
                      </p>
                      <p className="flex flex-wrap gap-2 text-[14px] text-secondary">
                        Consent text {c.consent_text_version}
                        {c.has_first_name && <Badge>First name held</Badge>}
                        {c.cases.map((k) => (
                          <Badge key={k.id} tone="info">
                            {k.reference} ({k.status})
                          </Badge>
                        ))}
                      </p>
                    </div>
                    <Button variant="danger" onClick={() => setErase(c)}>
                      Erase contact details
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="grid gap-3 border-t border-border p-4 md:max-w-lg">
                <h3 className="font-medium">Copy for the person (subject access)</h3>
                <TextArea
                  label="Request reference or reason"
                  value={reason}
                  maxLength={500}
                  onChange={(e) => setReason(e.target.value)}
                  helper="Recorded in the audit log. The file includes the clear phone number: send it only to the person."
                />
                <div>
                  <Button
                    variant="secondary"
                    busy={exportData.isPending}
                    disabled={reason.trim().length < 10}
                    onClick={() => exportData.mutate()}
                  >
                    Download their data (JSON)
                  </Button>
                </div>
                <div aria-live="polite">
                  {exportData.isSuccess && <Alert tone="success">The file has been downloaded.</Alert>}
                  {exportData.isError && <ErrorBox error={exportData.error} />}
                </div>
              </div>
            </>
          )}
        </section>
      )}

      <Dialog
        open={erase !== null}
        onOpenChange={(o) => !o && setErase(null)}
        title="Erase contact details?"
        description={`The phone number and first name for ${erase?.reference ?? ''} will be deleted permanently. The feedback stays, de-identified.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setErase(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              busy={doErase.isPending}
              disabled={eraseReason.trim().length < 10}
              onClick={() => doErase.mutate()}
            >
              Erase permanently
            </Button>
          </>
        }
      >
        <TextArea
          label="Request reference or reason"
          value={eraseReason}
          maxLength={500}
          onChange={(e) => setEraseReason(e.target.value)}
          helper="At least 10 characters. Recorded in the audit log."
        />
        <div aria-live="polite" className="mt-3">
          {doErase.isError && <ErrorBox error={doErase.error} />}
        </div>
      </Dialog>
    </>
  );
}
