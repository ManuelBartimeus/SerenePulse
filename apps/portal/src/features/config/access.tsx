// M05 survey access: the "Feedback form" overview page (public link, its QR code and posters).
import { Link } from '@tanstack/react-router';
import { useSession } from '../../lib/session';
import { PageHeader } from '../../pages/shell';
import { Alert, Badge } from '../../ui/controls';
import { displayLink, surveyLink } from './links';
import { PosterDownloads, QrCodeView } from './qr-view';
import { CopyButton, Section } from './shared';

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

/** The feedback form at a glance: link, QR code, posters and shortcuts. */
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
                Anyone with this link can give feedback. Share it with customers after a new policy or a
                renewal, or print the poster for your branch.
              </p>
            </div>
            <LinkBox url={main} label="Feedback form link" />
            <div className="flex flex-col gap-2">
              <p className="text-[14px] font-medium">Posters and images</p>
              <PosterDownloads url={main} filenameBase="serene-feedback" />
            </div>
          </div>
          <div className="flex flex-col items-center gap-3 rounded-lg bg-subtle p-6">
            <QrCodeView url={main} label={`QR code linking to ${displayLink(main)}`} size={260} />
            <Badge tone="brand">Scan to open the form</Badge>
          </div>
        </div>
      </section>

      {(can('survey.edit') || can('survey.publish.approve')) && (
        <Section title="Manage the form">
          <div className="grid gap-3 p-4 md:grid-cols-2 md:p-5">
            <Shortcut to="/config/survey" title="Survey questions">
              Change the questions and wording in a draft, preview it, then send it to an Executive to
              publish.
            </Shortcut>
            <Alert tone="info">
              Where a poster hangs never decides the branch. Customers say which branch issued their policy on
              the first page of the form.
            </Alert>
          </div>
        </Section>
      )}
    </>
  );
}
