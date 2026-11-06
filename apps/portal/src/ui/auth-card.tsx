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
        <div className="relative max-w-[460px]">
          <p className="text-[40px] font-medium leading-[46px] tracking-[-0.03em] xl:text-[46px] xl:leading-[52px]">
            Customers, proposals, policies and feedback in one place.
          </p>
          <p className="mt-5 text-[16px] leading-6 text-white/80">
            Review and price proposals, issue certificates, handle claims, and follow up on what customers
            tell each branch.
          </p>
        </div>
        <p className="relative text-[13px] leading-5 text-white/70">
          Serene Insurance LTD · Staff portal · For authorised staff only
        </p>
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
