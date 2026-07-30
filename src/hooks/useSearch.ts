import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface SearchHit {
  entity_type: 'lead' | 'customer'
  id: number
  code: string | null
  title: string | null
  subtitle: string | null
  status_label: string | null
  reason: string | null
}

/** Global arama (leads+customers; isim/şehir/telefon/e-posta/vergi/kod). Sunucu tarafı RPC. */
export function useGlobalSearch(query: string) {
  const q = query.trim()
  return useQuery({
    queryKey: ['global-search', q],
    enabled: q.length >= 2,
    queryFn: async (): Promise<SearchHit[]> => {
      const { data, error } = await supabase.rpc('global_search', { p_query: q, p_limit: 20 })
      if (error) throw error
      return (data ?? []) as SearchHit[]
    },
  })
}

/**
 * Kayıt oluşturulduktan sonra çağrılır: mükerrer aday varsa (kullanıcı uyarıyı
 * görüp yine de devam etti) event_log'a yazılır. Best-effort — hata create'i bozmaz.
 */
export async function logDedupOverride(
  entityType: 'lead' | 'customer',
  entityId: number,
  company: string | null,
  phone: string | null,
  taxNumber: string | null,
) {
  try {
    await supabase.rpc('log_dedup_override', {
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_company: company ?? undefined,
      p_phone: phone ?? undefined,
      p_tax_number: taxNumber ?? undefined,
    })
  } catch {
    /* izleme non-kritik */
  }
}

export interface DuplicateHit {
  entity_type: 'lead' | 'customer'
  id: number
  code: string | null
  title: string | null
  subtitle: string | null
  reason: string | null
}

export interface DuplicateArgs {
  company?: string | null
  phone?: string | null
  taxNumber?: string | null
  excludeType?: 'lead' | 'customer' | null
  excludeId?: number | null
}

/** Mükerrer aday tespiti (aynı firma/telefon/vergi no). Uyarı amaçlı, engelleme değil. */
export function useDuplicateCheck(args: DuplicateArgs, enabled: boolean) {
  const company = args.company?.trim() || null
  const phone = args.phone?.trim() || null
  const tax = args.taxNumber?.trim() || null
  return useQuery({
    queryKey: ['duplicates', company, phone, tax, args.excludeType, args.excludeId],
    enabled: enabled && !!(company || phone || tax),
    queryFn: async (): Promise<DuplicateHit[]> => {
      const { data, error } = await supabase.rpc('find_duplicates', {
        p_company: company ?? undefined,
        p_phone: phone ?? undefined,
        p_tax_number: tax ?? undefined,
        p_exclude_type: args.excludeType ?? undefined,
        p_exclude_id: args.excludeId ?? undefined,
      })
      if (error) throw error
      return (data ?? []) as DuplicateHit[]
    },
  })
}
