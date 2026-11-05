import type { ReactNode } from 'react';
import logoUrl from '@serene/ui/assets/serene-logo.svg';
import logoReversedUrl from '@serene/ui/assets/serene-logo-reversed.svg';

/**
 * Auth screens (E8). Phones and tablets: centred 420 px card on the subtle background, logo at 48 px.
 * Desktop (≥ 1200 px): split layout with a Serene-blue brand panel on the left and the form on white.
 */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-subtle lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:bg-white">
      <aside
        aria-hidden
        className="relative hidden overflow-hidden bg-brand text-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16"
      >
        <img src={logoReversedUrl} alt="" className="relative h-12 w-auto self-start" />
        <div className="relative max-w-[440px]">
          <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-accent">Staff portal</p>
          <p className="mt-4 text-[40px] font-medium leading-[46px] tracking-[-0.03em] xl:text-[48px] xl:leading-[54px]">
            What customers tell us, ready to act on.
          </p>
          <p className="mt-5 text-[16px] leading-6 text-white/80">
            Feedback from every branch, channel and product in one place, for the people who can fix things.
          </p>
        </div>
        <p className="relative text-[13px] leading-5 text-white/70">
          Serene Insurance LTD · For authorised staff only
        </p>
        <svg
          viewBox="0 0 400 400"
          className="pointer-events-none absolute -bottom-24 -right-24 w-[400px] xl:w-[460px]"
          focusable="false"
        >
          <circle cx="200" cy="200" r="120" fill="none" stroke="rgb(255 255 255 / 0.16)" strokeWidth="1.5" />
          <circle cx="200" cy="200" r="180" fill="none" stroke="rgb(255 255 255 / 0.09)" strokeWidth="1.5" />
          <path
            transform="rotate(-16 190 268)"
            d="M190 268c-28-32-58-64-54-116 1-16 12-26 24-18 28 18 38 70 30 134Z"
            fill="var(--color-accent)"
          />
          <path
            transform="rotate(16 214 268)"
            d="M214 268c28-32 58-64 54-116-1-16-12-26-24-18-28 18-38 70-30 134Z"
            fill="var(--color-accent)"
          />
        </svg>
      </aside>
      <main className="grid min-h-screen place-items-center px-4 py-10 lg:min-h-0 lg:px-12">
        <div className="w-full max-w-[420px] rounded-lg border border-border-subtle bg-white p-6 shadow-sm sm:p-8 lg:border-0 lg:p-0 lg:shadow-none">
          <img src={logoUrl} alt="Serene Insurance" className="h-12 w-auto lg:hidden" />
          <h1 className="mt-8 text-[26px] font-medium leading-8 tracking-[-0.02em] lg:mt-0 lg:text-[32px] lg:leading-10">
            {title}
          </h1>
          {subtitle && <p className="mt-2 text-[15px] leading-6 text-secondary">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
