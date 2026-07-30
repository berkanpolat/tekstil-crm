import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ensureRows } from '@/lib/errors'

export interface Sample {
  id: number
  operation_id: number
  quote_id: number | null
  version: number
  status_id: number | null
  status_key: string | null
  status_label: string | null
  status_color: string | null
  description: string | null
  fee: number | null
  fee_currency: string
  deduct_from_order: boolean
  shipped_at: string | null
  tracking_number: string | null
  carrier: string | null
  received_at: string | null
  approved_at: string | null
  approved_by: string | null
  approval_method: string | null
  approval_note: string | null
  rejection_reason: string | null
  revision_of_sample_id: number | null
  revision_round: number
  revision_reason: string | null
  deleted_at: string | null
  created_at: string
}

interface RawSample extends Omit<Sample, 'status_key' | 'status_label' | 'status_color'> {
  sample_statuses: { key: string; label: string; color: string | null } | null
}

const SELECT =
  'id, operation_id, quote_id, version, status_id, description, fee, fee_currency, deduct_from_order,' +
  ' shipped_at, tracking_number, carrier, received_at, approved_at, approved_by, approval_method, approval_note,' +
  ' rejection_reason, revision_of_sample_id, revision_round, revision_reason, deleted_at, created_at, sample_statuses(key, label, color)'

function mapSample(r: RawSample): Sample {
  const { sample_statuses, ...rest } = r
  return { ...rest, status_key: sample_statuses?.key ?? null, status_label: sample_statuses?.label ?? null, status_color: sample_statuses?.color ?? null }
}

export function useOperationSamples(operationId: number | null) {
  return useQuery({
    queryKey: ['samples', operationId],
    enabled: operationId != null,
    queryFn: async (): Promise<Sample[]> => {
      const { data, error } = await supabase.from('samples').select(SELECT)
        .eq('operation_id', operationId as number).order('version', { ascending: true })
      if (error) throw error
      return ((data ?? []) as unknown as RawSample[]).map(mapSample)
    },
  })
}

// ---------- Çapraz-operasyon liste (Numuneler ekranı) ----------
export interface SampleListRow {
  id: number
  operation_id: number
  version: number
  revision_round: number
  status_key: string | null
  status_label: string | null
  status_color: string | null
  shipped_at: string | null
  received_at: string | null
  tracking_number: string | null
  carrier: string | null
  created_at: string
  operation_code: string
  customer_name: string | null
}
interface RawSampleListRow {
  id: number; operation_id: number; version: number; revision_round: number
  shipped_at: string | null; received_at: string | null; tracking_number: string | null; carrier: string | null; created_at: string
  sample_statuses: { key: string; label: string; color: string | null } | null
  operations: { code: string; customers: { company_name: string | null; full_name: string | null } | null } | null
}
/** Tüm numuneler (silinmemiş) — operasyon kodu + müşteri ile. İstemci tarafı filtre/sıralama. */
export function useAllSamples() {
  return useQuery({
    queryKey: ['samples-all'],
    queryFn: async (): Promise<SampleListRow[]> => {
      const { data, error } = await supabase
        .from('samples')
        .select(
          'id, operation_id, version, revision_round, shipped_at, received_at, tracking_number, carrier, created_at,' +
          ' sample_statuses(key, label, color),' +
          ' operations!samples_operation_id_fkey(code, customers(company_name, full_name))',
        )
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(2000)
      if (error) throw error
      return ((data ?? []) as unknown as RawSampleListRow[]).map((r) => ({
        id: r.id, operation_id: r.operation_id, version: r.version, revision_round: r.revision_round,
        status_key: r.sample_statuses?.key ?? null, status_label: r.sample_statuses?.label ?? null, status_color: r.sample_statuses?.color ?? null,
        shipped_at: r.shipped_at, received_at: r.received_at, tracking_number: r.tracking_number, carrier: r.carrier, created_at: r.created_at,
        operation_code: r.operations?.code ?? '—',
        customer_name: r.operations?.customers?.company_name ?? r.operations?.customers?.full_name ?? null,
      }))
    },
  })
}

export function useCreateSample() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ operationId, quoteId }: { operationId: number; quoteId?: number | null }): Promise<number> => {
      const rows = ensureRows(await supabase.from('samples').insert({ operation_id: operationId, quote_id: quoteId ?? null } as never).select('id'))
      return (rows as { id: number }[])[0]!.id
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['samples', v.operationId] }),
  })
}

/** Aynı kayıtta revizyon: tur artır, sebep yaz, durum numune_uretimde'ye döner (Faz 4A). */
export function useReviseSample() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ sampleId, reason }: { sampleId: number; operationId: number; reason: string }): Promise<number> => {
      const { data, error } = await supabase.rpc('revise_sample', { p_sample_id: sampleId, p_reason: reason })
      if (error) throw error
      return data as number
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['samples', v.operationId] }),
  })
}

export interface SamplePatch {
  status_id?: number | null
  quote_id?: number | null
  description?: string | null
  fee?: number | null
  fee_currency?: string
  deduct_from_order?: boolean
  shipped_at?: string | null
  tracking_number?: string | null
  carrier?: string | null
  received_at?: string | null
  approved_at?: string | null
  approved_by?: string | null
  approval_method?: string | null
  approval_note?: string | null
  rejection_reason?: string | null
}

export function useUpdateSample() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, operationId: _op, ...patch }: SamplePatch & { id: number; operationId: number }) => {
      ensureRows(await supabase.from('samples').update(patch as never).eq('id', id).select('id'))
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['samples', v.operationId] }),
  })
}

export function useDeleteSample() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: number; operationId: number }) => {
      const { data: { user } } = await supabase.auth.getUser()
      ensureRows(await supabase.from('samples')
        .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null }).eq('id', id).select('id'))
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['samples', v.operationId] }),
  })
}

export function useSampleStatusOptions() {
  return useQuery({
    queryKey: ['sample-status-options'],
    queryFn: async () => (await supabase.from('sample_statuses').select('id, key, label, color, is_closed').eq('is_active', true).order('sort_order')).data ?? [],
  })
}
