import { useQuery } from '@tanstack/react-query';
import { useSession } from '../../lib/session';

export interface Option {
  id: string;
  label: string;
  code?: string;
  inactive?: boolean;
  regionId?: string;
}
export interface Catalogues {
  branches: Option[];
  regions: Option[];
  channels: Option[];
  products: Option[];
  factors: (Option & { isNone: boolean })[];
}

/** Filter options from the catalogue tables (Data API, RLS: readable by signed-in staff). */
export function useCatalogues() {
  const { supabase } = useSession();
  return useQuery({
    queryKey: ['analytics', 'catalogues'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Catalogues> => {
      const [b, r, c, p, f] = await Promise.all([
        supabase
          .from('branches')
          .select('id, code, name, region_id, is_active')
          .order('sort_order')
          .order('name'),
        supabase.from('regions').select('id, code, name, is_active').order('sort_order'),
        supabase.from('service_channels').select('id, code, label, is_active').order('sort_order'),
        supabase.from('insurance_products').select('id, code, label, is_active').order('sort_order'),
        supabase
          .from('improvement_factors')
          .select('id, code, label, is_active, is_none')
          .order('sort_order'),
      ]);
      const failed = [b, r, c, p, f].find((x) => x.error);
      if (failed?.error) throw failed.error;
      type Row = Record<string, unknown>;
      const rows = (x: { data: unknown }) => (x.data ?? []) as Row[];
      const base = (row: Row, label: string): Option => ({
        id: String(row.id),
        label,
        code: String(row.code ?? ''),
        inactive: row.is_active === false,
      });
      return {
        branches: rows(b).map((row) => ({ ...base(row, String(row.name)), regionId: String(row.region_id) })),
        regions: rows(r).map((row) => base(row, String(row.name))),
        channels: rows(c).map((row) => base(row, String(row.label))),
        products: rows(p).map((row) => base(row, String(row.label))),
        factors: rows(f).map((row) => ({ ...base(row, String(row.label)), isNone: row.is_none === true })),
      };
    },
  });
}
