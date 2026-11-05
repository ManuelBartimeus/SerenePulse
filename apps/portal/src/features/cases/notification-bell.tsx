/** Notification centre (M14): bell with unread count in the shell header. Owned by the cases feature (MS-11). */
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useSession } from '../../lib/session';
import { IconBell } from '../../ui/icons';

export function useUnreadCount() {
  const { supabase, session } = useSession();
  return useQuery({
    queryKey: ['notifications', 'unread'],
    enabled: !!session,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function NotificationBell() {
  const unread = useUnreadCount();
  const n = unread.data ?? 0;
  const label = n > 0 ? `Notifications, ${n} unread` : 'Notifications';
  return (
    <Link
      to="/notifications"
      aria-label={label}
      className="relative grid size-11 place-items-center rounded-sm text-ink hover:bg-surface-muted"
    >
      <IconBell />
      {n > 0 && (
        <span
          aria-hidden
          className="absolute right-1 top-1 min-w-5 rounded-full bg-danger px-1 text-center text-[11px] font-medium leading-5 text-white"
        >
          {n > 99 ? '99+' : n}
        </span>
      )}
    </Link>
  );
}
