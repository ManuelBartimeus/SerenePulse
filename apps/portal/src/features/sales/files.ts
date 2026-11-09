import { useQuery } from '@tanstack/react-query';
import { useSession } from '../../lib/session';
import { SALES } from './api';

/** Short-lived links (5 minutes) for several private files at once: path → URL. */
export function useSignedUrls(paths: readonly string[]): Record<string, string> {
  const { supabase } = useSession();
  const sorted = [...new Set(paths)].sort();
  const q = useQuery({
    queryKey: ['sales', 'signed-many', sorted],
    enabled: sorted.length > 0,
    // Links last 5 minutes: renew them at 4 so images on a page left open never break.
    staleTime: 240_000,
    refetchInterval: 240_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(SALES.bucket).createSignedUrls(sorted, 300);
      if (error) throw error;
      const out: Record<string, string> = {};
      for (const d of data) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
      return out;
    },
  });
  return q.data ?? {};
}
