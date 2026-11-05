import type { ReactNode } from 'react';
import logoUrl from '@serene/ui/assets/serene-logo.svg';

/** Auth screens (E8): centred 420 px card on the subtle background, logo at 48 px. */
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
    <main className="grid min-h-screen place-items-center bg-subtle px-4 py-10">
      <div className="w-full max-w-[420px] rounded-lg bg-white p-8">
        <img src={logoUrl} alt="Serene Insurance" className="h-12 w-auto" />
        <h1 className="mt-8 text-[24px] font-medium leading-8">{title}</h1>
        {subtitle && <p className="mt-2 text-secondary">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
