import type { ReactNode } from 'react';
import { AccessDeniedPage } from '../pages/shell';
import { useSession } from './session';

/** Direct URL access without the permission shows the access-denied page (STEP 7). Any of several permissions grants access. */
export function RequirePerm({
  permission,
  children,
}: {
  permission: string | string[];
  children: ReactNode;
}) {
  const { can } = useSession();
  const allowed = (Array.isArray(permission) ? permission : [permission]).some((p) => can(p));
  return allowed ? <>{children}</> : <AccessDeniedPage />;
}
