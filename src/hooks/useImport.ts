import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toUserMessage } from '@/lib/errors'
import { normalizeTr } from '@/lib/normalize'

export type ImportEntity = 'lead' | 'customer'

export interface ImportField {
  key: string
  label: string
  synonyms: string[]
  contact?: 'phone' | 'email'
}

const BASE_FIELDS: ImportField[] = [
  { key: 'full_name', label: 'Kişi adı', synonyms: ['ad', 'isim', 'kisi', 'yetkili', 'ad soyad', 'adi soyadi', 'name', 'full name'] },
  { key: 'company_name', label: 'Firma adı', synonyms: ['firma', 'sirket', 'company', 'unvan', 'firma adi'] },
  { key: 'country', label: 'Ülke', synonyms: ['ulke', 'country'] },
  { key: 'city', label: 'Şehir', synonyms: ['sehir', 'il', 'city'] },
  { key: 'district', label: 'İlçe', synonyms: ['ilce', 'district'] },
  { key: 'address', label: 'Adres', synonyms: ['adres', 'address'] },
  { key: 'phone', label: 'Telefon', synonyms: ['telefon', 'tel', 'gsm', 'cep', 'phone'], contact: 'phone' },
  { key: 'email', label: 'E-posta', synonyms: ['eposta', 'e posta', 'email', 'mail'], contact: 'email' },
  { key: 'external_id', label: 'Dış ID', synonyms: ['dis id', 'external id', 'kaynak id'] },
]
const CUSTOMER_EXTRA: ImportField[] = [
  { key: 'tax_office', label: 'Vergi dairesi', synonyms: ['vergi dairesi', 'vd'] },
  { key: 'tax_number', label: 'Vergi numarası', synonyms: ['vergi no', 'vergi numarasi', 'vkn', 'tax'] },
  { key: 'iban', label: 'IBAN', synonyms: ['iban'] },
  { key: 'bank_name', label: 'Banka', synonyms: ['banka', 'bank'] },
  { key: 'account_holder', label: 'Hesap sahibi', synonyms: ['hesap sahibi', 'account holder'] },
]

export function importFields(entity: ImportEntity): ImportField[] {
  return entity === 'customer' ? [...BASE_FIELDS, ...CUSTOMER_EXTRA] : BASE_FIELDS
}

export function autoMap(headers: string[], fields: ImportField[]): Record<string, number | null> {
  const normHeaders = headers.map((h) => normalizeTr(h) ?? '')
  const map: Record<string, number | null> = {}
  for (const f of fields) {
    let idx: number | null = null
    for (let i = 0; i < normHeaders.length; i++) {
      const nh = normHeaders[i] ?? ''
      if (f.synonyms.some((s) => nh === s || nh.includes(s))) {
        idx = i
        break
      }
    }
    map[f.key] = idx
  }
  return map
}

export interface ImportError {
  row: number
  message: string
}
export interface ImportSkip {
  row: number
  reason: string
}
export interface ImportResult {
  batchId: number
  inserted: number
  skipped: ImportSkip[]
  errors: ImportError[]
}

const DIRECT: Record<ImportEntity, string[]> = {
  lead: ['full_name', 'company_name', 'country', 'city', 'district', 'address'],
  customer: [
    'full_name', 'company_name', 'country', 'city', 'district', 'address',
    'tax_office', 'tax_number', 'iban', 'bank_name', 'account_holder',
  ],
}

export function useRunImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      entity: ImportEntity
      fileName: string
      headers: string[]
      rows: string[][]
      mapping: Record<string, number | null>
      sourceId?: number | null
    }): Promise<ImportResult> => {
      const { entity, fileName, headers, rows, mapping } = input
      const {
        data: { user },
      } = await supabase.auth.getUser()

      const val = (r: string[], key: string): string | null => {
        const idx = mapping[key]
        if (idx == null) return null
        return (r[idx] ?? '').trim() || null
      }

      // Sütun eşlemesini alan adı → BAŞLIK ADI olarak sakla (dosyalar arası taşınır).
      const mappingByName: Record<string, string> = {}
      for (const [k, idx] of Object.entries(mapping)) if (idx != null) mappingByName[k] = headers[idx] ?? ''

      const batchRes = await supabase
        .from('import_batches')
        .insert({ entity_type: entity, file_name: fileName, total_rows: rows.length, created_by: user?.id ?? null, column_mapping: mappingByName as never })
        .select('id')
        .single()
      if (batchRes.error) throw batchRes.error
      const batchId = batchRes.data.id as number

      // TÜM dosya mükerrer kontrolü (tek RPC) → eşleşenler atlanacak.
      const rowsJson = rows.map((r) => ({ company: val(r, 'company_name'), phone: val(r, 'phone'), tax: val(r, 'tax_number') }))
      const dupRes = await supabase.rpc('check_import_duplicates', { p_rows: rowsJson as never })
      const skipMap = new Map<number, string>()
      if (!dupRes.error && dupRes.data) {
        for (const d of dupRes.data as { idx: number; matched: boolean; reason: string | null }[]) {
          if (d.matched) skipMap.set(d.idx, d.reason ?? 'mükerrer')
        }
      }

      const errors: ImportError[] = []
      const skipped: ImportSkip[] = []
      let inserted = 0
      for (let i = 0; i < rows.length; i++) {
        if (skipMap.has(i)) {
          skipped.push({ row: i + 2, reason: skipMap.get(i)! })
          continue
        }
        const r = rows[i] as string[]
        try {
          const rec: Record<string, unknown> = { import_batch_id: batchId, created_by: user?.id ?? null }
          for (const k of DIRECT[entity]) rec[k] = val(r, k)
          // 1.5 — İçe aktarma sırasında seçilen kaynak tüm partiye uygulanır (CSV'de kaynak olmayabilir).
          if (input.sourceId != null) rec.source_id = input.sourceId
          const extId = val(r, 'external_id')
          if (extId) {
            rec.external_source = 'import'
            rec.external_id = extId
          }
          if (!rec.full_name && !rec.company_name) throw new Error('Kişi adı veya firma adından en az biri gerekli.')
          const ins = await supabase.from(entity === 'lead' ? 'leads' : 'customers').insert(rec as never).select('id').single()
          if (ins.error) throw ins.error
          const entityId = (ins.data as { id: number }).id

          const phone = val(r, 'phone')
          const email = val(r, 'email')
          const contacts = [
            phone ? { type: 'phone', value: phone } : null,
            email ? { type: 'email', value: email } : null,
          ].filter(Boolean) as { type: string; value: string }[]
          if (contacts.length) {
            await supabase.from('contact_points').insert(
              contacts.map((c) => ({ entity_type: entity, entity_id: entityId, type: c.type, value: c.value, created_by: user?.id ?? null })),
            )
          }
          inserted++
        } catch (err) {
          errors.push({ row: i + 2, message: await toUserMessage(err) })
        }
      }

      await supabase.from('import_batches').update({ inserted_rows: inserted, error_rows: errors.length }).eq('id', batchId)
      return { batchId, inserted, skipped, errors }
    },
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: [v.entity === 'lead' ? 'leads' : 'customers'] })
      qc.invalidateQueries({ queryKey: ['import-batches'] })
    },
  })
}

export interface ImportBatch {
  id: number
  entity_type: ImportEntity
  file_name: string | null
  total_rows: number
  inserted_rows: number
  error_rows: number
  created_at: string
  undone_at: string | null
  column_mapping: Record<string, string> | null
}

export function useImportBatches() {
  return useQuery({
    queryKey: ['import-batches'],
    queryFn: async (): Promise<ImportBatch[]> => {
      const { data, error } = await supabase
        .from('import_batches')
        .select('id, entity_type, file_name, total_rows, inserted_rows, error_rows, created_at, undone_at, column_mapping')
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data ?? []) as unknown as ImportBatch[]
    },
  })
}

/**
 * Aynı dosya adı ya da aynı başlık setinden önceki eşlemeyi bul (öntanımlı için).
 * Hook değil — dosya yüklenince tek seferde çağrılır (effect/cascade yok).
 */
export async function fetchRememberedMapping(
  entity: ImportEntity,
  fileName: string,
  headers: string[],
): Promise<Record<string, string> | null> {
  const { data, error } = await supabase
    .from('import_batches')
    .select('file_name, column_mapping')
    .eq('entity_type', entity)
    .not('column_mapping', 'is', null)
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) return null
  const hset = new Set(headers)
  for (const b of (data ?? []) as { file_name: string | null; column_mapping: Record<string, string> | null }[]) {
    if (!b.column_mapping) continue
    if (b.file_name === fileName) return b.column_mapping
    const values = Object.values(b.column_mapping)
    if (values.length && values.every((h) => hset.has(h))) return b.column_mapping
  }
  return null
}

export function useUndoImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (batchId: number): Promise<{ undone: number; skipped: number }> => {
      const { data, error } = await supabase.rpc('undo_import_batch', { p_batch_id: batchId })
      if (error) throw error
      return data as { undone: number; skipped: number }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['import-batches'] })
    },
  })
}
