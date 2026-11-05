// M05 survey access: the "Feedback form" overview page and the SMS-link guide (S-B9).
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useSession } from '../../lib/session';
import { PageHeader } from '../../pages/shell';
import { Alert, Badge } from '../../ui/controls';
import { displayLink, smsLength, smsLink, suggestedSmsWording, surveyLink } from './links';
import { PosterDownloads, QrCodeView } from './qr-view';
import { CopyButton, Section, TextArea } from './shared';

function useCompanyName(): string {
  const { supabase } = useSession();
  const q = useQuery({
    queryKey: ['config', 'company-display-name'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'company_display_name')
        .maybeSingle();
      if (error) throw error;
      return typeof data?.value === 'string' && data.value.trim() ? data.value.trim() : 'Serene Insurance';
    },
    staleTime: 5 * 60 * 1000,
  });
  return q.data ?? 'Serene Insurance';
}

function LinkBox({ url, label }: { url: string; label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1.5">
        <span className="text-[14px] font-medium">{label}</span>
        <input
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className="h-12 w-full rounded-sm border border-border-strong bg-surface-muted px-4 text-[16px]"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={url} label="Copy link" copiedLabel="Link copied" />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-12 items-center justify-center rounded-full px-5 text-[16px] font-medium text-brand hover:bg-brand-50"
        >
          Open in new tab<span className="sr-only"> (opens a new tab)</span>
        </a>
      </div>
    </div>
  );
}

/** Editable SMS wording with a live character count (≤ 160 GSM-7 characters is one SMS). */
export function SmsWording() {
  const { env } = useSession();
  const company = useCompanyName();
  const link = smsLink(env.VITE_SURVEY_URL);
  const suggested = suggestedSmsWording(link, company);
  const [text, setText] = useState<string | null>(null);
  const value = text ?? suggested;
  const len = smsLength(value);
  const missingLink = !value.includes(link);
  return (
    <div className="flex flex-col gap-4">
      <LinkBox url={link} label="SMS link (counts these visits as “SMS link”)" />
      <TextArea
        label="Suggested wording"
        value={value}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        helper={
          len.encoding === 'UCS-2'
            ? 'Contains characters outside the standard SMS alphabet (for example curly quotes or emoji), so one SMS holds only 70 characters.'
            : 'Standard SMS alphabet: one SMS holds 160 characters.'
        }
        counter={
          <span className={len.fitsOne ? '' : 'font-medium text-danger'}>
            {len.units}/{len.limit} characters{len.fitsOne ? '' : ` · ${len.segments} SMS`}
          </span>
        }
        error={
          !len.fitsOne
            ? 'This is longer than one SMS. Shorten it so customers receive a single message.'
            : missingLink
              ? 'The wording no longer contains the exact SMS link above.'
              : null
        }
      />
      <div className="flex flex-wrap gap-2">
        <CopyButton text={value} label="Copy wording" copiedLabel="Wording copied" />
        {text !== null && text !== suggested && (
          <button
            type="button"
            className="h-12 rounded-full px-5 font-medium text-brand hover:bg-brand-50"
            onClick={() => setText(null)}
          >
            Restore suggested wording
          </button>
        )}
      </div>
    </div>
  );
}

function SmsAdvice() {
  return (
    <ul className="list-disc space-y-2 pl-6 text-secondary">
      <li>
        Send the link <strong className="font-medium text-ink">right after each eligible transaction</strong>:
        new policies and renewals, while the experience is fresh.
      </li>
      <li>Send it once per transaction, from the “SERENE” sender ID through your usual SMS provider.</li>
      <li>Use the link exactly as shown, so these visits are counted as “SMS link” in the Sources report.</li>
      <li>Don’t add policy numbers, names or other personal details to the link or the message.</li>
    </ul>
  );
}

/** S-B9 SMS-link guide for Serene's SMS team. */
export function SmsGuidePage() {
  return (
    <>
      <PageHeader title="SMS link guide" subtitle="For the team that sends Serene’s customer SMS." />
      <div className="mb-4">
        <Alert tone="info" title="This system doesn’t send or track SMS">
          Your SMS team sends the message through Serene’s own provider. We only see the visits the link
          brings in.
        </Alert>
      </div>
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Section
          title="Link and wording"
          description="Edit the wording if you need to; the counter shows whether it still fits one SMS."
        >
          <div className="p-4 md:p-5">
            <SmsWording />
          </div>
        </Section>
        <Section title="When to send it">
          <div className="p-4 md:p-5">
            <SmsAdvice />
          </div>
        </Section>
      </div>
    </>
  );
}

function Shortcut({ to, title, children }: { to: string; title: string; children: string }) {
  return (
    <Link
      to={to}
      className="flex min-h-11 flex-col gap-1 rounded-md border border-border p-4 hover:border-brand hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand"
    >
      <span className="font-medium text-brand">{title} →</span>
      <span className="text-[14px] leading-5 text-secondary">{children}</span>
    </Link>
  );
}

/** The feedback form at a glance: link, QR code, posters, SMS wording and shortcuts. */
export function FeedbackFormPage() {
  const { env, can } = useSession();
  const main = surveyLink(env.VITE_SURVEY_URL);
  return (
    <>
      <PageHeader
        title="Feedback form"
        subtitle="The public survey customers use to tell Serene how we did. No sign-in, under a minute."
      />
      <section aria-labelledby="ff-main" className="mb-6 overflow-hidden rounded-lg bg-white">
        <div aria-hidden>
          <div className="h-1.5 bg-brand" />
          <div className="h-0.5 bg-accent" />
        </div>
        <div className="grid gap-8 p-5 md:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-[12px] font-medium uppercase leading-4 tracking-[1px] text-muted">
                Public link
              </p>
              <h2
                id="ff-main"
                className="mt-1 break-all text-[24px] font-medium leading-8 text-brand md:text-[28px] md:leading-9"
              >
                {displayLink(main)}
              </h2>
              <p className="mt-2 max-w-xl text-secondary">
                Anyone with this link can give feedback. Visits through it count as “direct”. Use the SMS link
                below in text messages, and a QR point for each printed poster, so you can see where feedback
                comes from.
              </p>
            </div>
            <LinkBox url={main} label="Feedback form link" />
            <div className="flex flex-col gap-2">
              <p className="text-[14px] font-medium">Downloads for this link</p>
              <PosterDownloads url={main} filenameBase="serene-feedback" />
              <p className="text-[14px] leading-5 text-secondary">
                For printed posters, prefer a{' '}
                <Link to="/config/qr-points" className="font-medium text-brand underline">
                  QR point
                </Link>
                : its own code lets you see scans per location.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-3 rounded-lg bg-subtle p-6">
            <QrCodeView url={main} label={`QR code linking to ${displayLink(main)}`} size={260} />
            <Badge tone="brand">Scan to open the form</Badge>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Section
          title="SMS link and wording"
          description="Give this to Serene’s SMS team. The system doesn’t send or track SMS."
        >
          <div className="flex flex-col gap-5 p-4 md:p-5">
            <SmsWording />
            <SmsAdvice />
          </div>
        </Section>
        <Section title="Manage the form">
          <div className="flex flex-col gap-3 p-4 md:p-5">
            {can('config.qr_points') && (
              <Shortcut to="/config/qr-points" title="QR points">
                Create a code per poster location, download posters and deactivate old ones.
              </Shortcut>
            )}
            {(can('survey.edit') || can('survey.publish.approve')) && (
              <Shortcut to="/config/survey" title="Survey versions">
                Change wording and rules in a draft, preview it, and send it for approval.
              </Shortcut>
            )}
            <Shortcut to="/config/sms-link" title="SMS link guide">
              A page to share with the SMS team: the exact link, wording and when to send it.
            </Shortcut>
            <Alert tone="info">
              A poster’s location never decides the branch. Customers say which branch issued their policy on
              Page 1.
            </Alert>
          </div>
        </Section>
      </div>
    </>
  );
}
