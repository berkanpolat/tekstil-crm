import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { env, hasPdfService, PDF_UNAVAILABLE } from '@/lib/env'
import { ensureRows } from '@/lib/errors'
import { useUploadFile, getSignedUrl } from './useFiles'
import { buildDraftOpts, draftMissingNote, deriveUnitCost, firstImagePath, type DraftLineInput } from '@/lib/draftQuoteBridge'
import type { MarginTier } from '@/lib/pricing'

/** 1.9 — Operasyonun (talebin) birincil görselini data URL + en/boy oranıyla getir.
 *  Fiyat teklifi belgesinde görselin otomatik gelmesi için (elle yüklemeye gerek kalmadan). */
export async function fetchOperationPhoto(operationId: number): Promise<{ foto: string; ar: number } | null> {
  const { data } = await supabase.from('files')
    .select('storage_path').eq('entity_type', 'operation').eq('entity_id', String(operationId))
    .eq('category', 'image').is('deleted_at', null).order('id', { ascending: true }).limit(1)
  const path = (data as { storage_path: string }[] | null)?.[0]?.storage_path
  if (!path) return null
  try {
    const url = await getSignedUrl('documents', path, 120)
    const blob = await (await fetch(url)).blob()
    const foto = await new Promise<string>((res, rej) => {
      const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(blob)
    })
    const ar = await new Promise<number>((res) => {
      const img = new Image(); img.onload = () => res(img.naturalWidth / (img.naturalHeight || 1)); img.onerror = () => res(1); img.src = foto
    })
    return { foto, ar: ar || 1 }
  } catch { return null }
}

/** Şablon adı → PDF servisi template anahtarı (document_types.template_name = key). */
const TEMPLATE_NAME: Record<DocumentTypeKey, string> = {
  fiyat_teklifi: 'fiyat_teklifi', siparis_onay: 'siparis_onay', numune_etiketi: 'numune_etiketi',
  siparis_formu: 'siparis_formu', koli_ustu: 'koli_ustu',
}

/**
 * İç not SIZINTI KORUMASI (QA#10): iç not + editör-içi (_ önekli) alanlar render/preview'a
 * ASLA gönderilmez. Belgeye kaydedilirken (documents.data) korunur, ama PDF/önizleme verisinden
 * ayıklanır. Şablonlar bu alanları okumaz; bu ayıklama ikinci güvenlik katmanıdır.
 */
export function stripInternal(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (k === 'internalNote' || k.startsWith('_')) continue
    out[k] = v
  }
  return out
}

/** Canlı önizleme — PDF servisi /preview → stilli HTML. Editör yazarken (debounce) çağırır. */
export async function fetchPreviewHtml(typeKey: DocumentTypeKey, data: Record<string, unknown>, language: string): Promise<string> {
  if (!hasPdfService) return `<div style="display:flex;height:100%;align-items:center;justify-content:center;color:#64748b;font-family:sans-serif;text-align:center;padding:2rem">${PDF_UNAVAILABLE}<br>Önizleme için belge servisi yapılandırılmalı.</div>`
  const res = await fetch(env.pdfServiceUrl.replace(/\/$/, '') + '/preview', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ template: TEMPLATE_NAME[typeKey], data: stripInternal(data), language }),
  })
  if (!res.ok) throw new Error(`Önizleme hatası (${res.status}).`)
  return res.text()
}

/** Döviz kuru (TCMB Döviz Satış) — PDF servisi sunucu tarafında çeker (B1). */
export async function fetchRates(): Promise<{ USD: number | null; EUR: number | null; GBP: number | null; date: string; source: string } | null> {
  try {
    const res = await fetch(env.pdfServiceUrl.replace(/\/$/, '') + '/rates')
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

/** Belirli tarihteki TCMB kuru (ödeme günü kuru). Hafta sonu/tatilde en yakın önceki
 *  bültene yürünür; bulletinDate gerçek bülten tarihini verir. found=false → kur yok. */
export async function fetchRateOnDate(date: string): Promise<{ found: boolean; date: string; bulletinDate?: string; USD?: number; EUR?: number; GBP?: number } | null> {
  try {
    const res = await fetch(env.pdfServiceUrl.replace(/\/$/, '') + '/rate-on-date?date=' + encodeURIComponent(date))
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

/**
 * P6.7 düzeltme — Sipariş bilgisi BELGEDEN okunur (YZ yerine). Sipariş formunu SİSTEM üretir;
 * veri zaten documents.data'da JSON'dur → en pahalı YZ kullanımını (PDF→model) ortadan kaldırır.
 * siparis_onay (varsa) yoksa siparis_formu belgesinin verisini alan+kaynak biçimine eşler.
 */
export async function fetchOrderDocFields(operationId: number): Promise<{ fields: Record<string, { value: unknown; source: string | null }>; docLabel: string } | null> {
  const { data } = await supabase.from('documents')
    .select('data, generated_at, document_types(key, label_tr)')
    .eq('operation_id', operationId).is('deleted_at', null).order('generated_at', { ascending: false })
  const rows = (data ?? []) as unknown as { data: Record<string, unknown>; document_types: { key: string; label_tr: string } | null }[]
  const doc = rows.find((r) => r.document_types?.key === 'siparis_onay') ?? rows.find((r) => r.document_types?.key === 'siparis_formu')
  if (!doc) return null
  const key = doc.document_types!.key
  const label = doc.document_types!.label_tr || key
  const src = `Belge: ${label}`
  const f = (value: unknown) => ({ value: value ?? null, source: value != null && value !== '' ? src : null })
  if (key === 'siparis_onay') {
    const s = (doc.data?.soS ?? {}) as Record<string, unknown>
    return { docLabel: label, fields: {
      adet: f(s.adet), birim_fiyat: f(s.birim), renkler: f(s.renk), bedenler: f(s.beden),
      toplam_tutar: f(s.tutar), teslim_tarihi: f(s.termin ?? s.ftarih), odeme_kosulu: f(''),
    } }
  }
  const s = (doc.data?.sip ?? {}) as Record<string, unknown>
  const join = (a: unknown) => Array.isArray(a) ? a.join(', ') : a
  return { docLabel: label, fields: {
    adet: f(s.toplam), birim_fiyat: f(s.birim), renkler: f(join(s.renkler)), bedenler: f(join(s.bedenler)),
    // teslim_tarihi AYRI alandan (sip.teslim) okunur — s.tarih belgenin değişiklik tarihidir, teslim değil.
    // Alan boşsa boş gelir (yanlış değer gösterilmez).
    toplam_tutar: f(''), teslim_tarihi: f(s.teslim), odeme_kosulu: f(s.odeme),
  } }
}

/** Üretici bilgileri (settings.company.*) — bağımsız belgede editör bunu veriye ekler. */
export async function fetchUretici(): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc('document_uretici')
  if (error) throw error
  return (data ?? {}) as Record<string, unknown>
}

export interface DocDefaults { taxRate: string; paymentTerms: string; validityDays: number; taxOptions: number[] }

/** Belge editörü varsayılanları (KDV, ödeme koşulu, geçerlilik) — ayarlardan (A4/A5). */
export async function fetchDocDefaults(): Promise<DocDefaults> {
  const { data } = await supabase.from('settings').select('key, value')
    .in('key', ['quotes.default_tax_rate', 'documents.default_payment_terms', 'quotes.default_validity_days', 'quotes.tax_rate_options'])
  const m = new Map((data ?? []).map((r) => [r.key, r.value]))
  const asStr = (v: unknown, d: string) => (v == null ? d : String(v))
  return {
    taxRate: asStr(m.get('quotes.default_tax_rate'), '10'),
    paymentTerms: asStr(m.get('documents.default_payment_terms'), '%50 Ön Ödeme %50 Sevkiyat Öncesi'),
    validityDays: Number(m.get('quotes.default_validity_days') ?? 7),
    taxOptions: Array.isArray(m.get('quotes.tax_rate_options')) ? (m.get('quotes.tax_rate_options') as number[]) : [0, 1, 10, 20],
  }
}

/** Yeni TAS kodu üret (generate_operation_code) → 6 karakterlik gövde (A1 "Oto üret"). */
export async function generateTasBody(): Promise<string> {
  const { data, error } = await supabase.rpc('generate_operation_code', { p_entity_type: 'document' })
  if (error) throw error
  const full = String(data ?? '')
  const i = full.lastIndexOf('-')
  return i >= 0 ? full.slice(i + 1) : full
}

export interface DocCategoryOptions { groups: { id: number; label: string }[]; typesByGroup: Record<number, { id: number; label: string }[]> }

/** Ürün Grubu (Grup/Dal) + Türü açılır menüleri için aktif kategori ağacı (A3). */
export function useDocCategoryOptions() {
  return useQuery({
    queryKey: ['doc-category-options'],
    queryFn: async (): Promise<DocCategoryOptions> => {
      const { data, error } = await supabase.from('product_categories')
        .select('id, label, parent_id, is_active').eq('is_active', true).order('sort_order').order('label')
      if (error) throw error
      const rows = (data ?? []) as { id: number; label: string; parent_id: number | null }[]
      const groups = rows.filter((r) => r.parent_id == null).map((r) => ({ id: r.id, label: r.label }))
      const typesByGroup: Record<number, { id: number; label: string }[]> = {}
      for (const r of rows) if (r.parent_id != null) (typesByGroup[r.parent_id] ??= []).push({ id: r.id, label: r.label })
      return { groups, typesByGroup }
    },
  })
}

/** Operasyondan render-hazır ön veri (iç-not güvenli). Bağımsız belgede boş şablon kullanılır. */
export async function buildDocumentData(operationId: number, typeKey: DocumentTypeKey, language: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc('build_document_data', { p_operation_id: operationId, p_type: typeKey, p_language: language })
  if (error) throw error
  return data as Record<string, unknown>
}

/** Storage yolundaki görseli data URL + en/boy oranına çevir (belge görseli için). Hata → null. */
async function storagePathToDataUrl(path: string): Promise<{ foto: string; ar: number } | null> {
  try {
    const url = await getSignedUrl('documents', path, 120)
    const blob = await (await fetch(url)).blob()
    const foto = await new Promise<string>((res, rej) => {
      const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(blob)
    })
    const ar = await new Promise<number>((res) => {
      const img = new Image(); img.onload = () => res(img.naturalWidth / (img.naturalHeight || 1)); img.onerror = () => res(1); img.src = foto
    })
    return { foto, ar: ar || 1 }
  } catch { return null }
}

interface DraftSatir { urun?: string; kod?: string; adet?: number; birim_fiyat?: number | null; tutar?: number | null; maliyet_eksik?: boolean }
interface OciCatalogRow {
  catalog_product_code: string | null; label: string | null; catalog_product_id: number | null
  catalog_products: { custom_margin_percent: number | null; images: { sort_order: number; files: { storage_path: string } | null }[] } | null
}

/**
 * P8A — Taslak teklif → fiyat_teklifi belgesi köprüsü (async orkestrasyon).
 * Operasyondan temel alanları (build_document_data), taslaktan ürün/fiyatı, katalogdan görseli
 * toplar; saf buildDraftOpts ile seçili adetlere göre fiyat satırları üretir. Sonuç DocumentEditorPage'e
 * router state.prefill olarak verilir → belge dolu ve DÜZENLENEBİLİR açılır.
 */
export async function buildDraftQuotePrefill(
  operationId: number,
  draftData: Record<string, unknown>,
  quantities: number[],
): Promise<{ tkS: Record<string, unknown> }> {
  // 1) Operasyondan temel alanlar (talep no ← code, müşteri, grup/tür). Başarısız olursa boş devam.
  let baseTkS: Record<string, unknown> = {}
  try {
    const base = await buildDocumentData(operationId, 'fiyat_teklifi', 'tr')
    baseTkS = (base?.tkS ?? {}) as Record<string, unknown>
  } catch { /* boş temelle devam */ }

  const satirlar = (draftData.satirlar as DraftSatir[] | undefined) ?? []
  const recommendedQty = Number(draftData.adet_kademesi ?? 50) || 50

  // 2) Katalog kalemleri: özel marj + görsel (koda göre eşle). Görsel/marj için costs.view gerekmez.
  const { data: ociData } = await supabase.from('operation_catalog_items')
    .select('catalog_product_code, label, catalog_product_id, catalog_products(custom_margin_percent, images:catalog_product_images(sort_order, files(storage_path)))')
    .eq('operation_id', operationId)
  const byCode = new Map<string, { custom_margin_percent: number | null; images: { sort_order: number; storage_path: string | null }[] }>()
  for (const r of (ociData ?? []) as unknown as OciCatalogRow[]) {
    const cp = r.catalog_products
    byCode.set(String(r.catalog_product_code ?? ''), {
      custom_margin_percent: cp?.custom_margin_percent ?? null,
      images: (cp?.images ?? []).map((im) => ({ sort_order: im.sort_order, storage_path: im.files?.storage_path ?? null })),
    })
  }

  // 3) Varsayılan taslak marjı (birim fiyattan ham maliyet türetmek için) + marj kademeleri.
  const { data: setRow } = await supabase.from('settings').select('value').eq('key', 'intake.draft_margin_percent').maybeSingle()
  const draftMargin = Number((setRow?.value as unknown) ?? 40) || 40
  const { data: tierData } = await supabase.from('margin_tiers').select('min_quantity, margin_percent').eq('is_active', true).order('min_quantity')
  const tiers = (tierData ?? []) as MarginTier[]

  // 4) Satırlar → saf köprü.
  const lines: DraftLineInput[] = satirlar.map((s) => {
    const info = byCode.get(String(s.kod ?? ''))
    return {
      urun: String(s.urun ?? s.kod ?? 'Ürün'),
      kod: (s.kod as string | undefined) ?? null,
      unitCostUsd: deriveUnitCost(s.birim_fiyat, draftMargin),
      customMargin: info?.custom_margin_percent ?? null,
    }
  })
  const { opts, missingProducts } = buildDraftOpts({ lines, quantities, tiers, recommendedQty })

  // 5) Görsel: ilk katalog ürününün ilk görseli (Kural 1 — yoksa görselsiz açılır, hata yok).
  let foto: string | undefined; let fotoAR: number | undefined
  for (const s of satirlar) {
    const path = firstImagePath(byCode.get(String(s.kod ?? ''))?.images)
    if (!path) continue
    const p = await storagePathToDataUrl(path)
    if (p) { foto = p.foto; fotoAR = p.ar; break }
  }

  // 6) Tam tkS (blankData ile aynı alanlar; DocumentEditorPage prefill'i tkS'yi toptan değiştirir).
  const tkS: Record<string, unknown> = {
    talep: baseTkS.talep ?? '', musteri: baseTkS.musteri ?? '', grup: baseTkS.grup ?? '', tur: baseTkS.tur ?? '',
    gecerli: (baseTkS.gecerli as string) || '7 Gün',
    teslimat: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), // öngörülen teslimat = bugün + 7 gün
    odeme: '%50 Ön Ödeme, %50 Sevkiyat Öncesi',
    para: 'USD', // taslak maliyet/fiyatı USD; editörde değiştirilebilir
    kdv: (baseTkS.kdv as string) ?? '20', indirim: '0',
    not: draftMissingNote(missingProducts), dil: 'tr',
    opts,
  }
  if (foto) { tkS.foto = foto; tkS.fotoAR = fotoAR }
  return { tkS }
}

export type DocumentTypeKey = 'fiyat_teklifi' | 'siparis_onay' | 'numune_etiketi' | 'siparis_formu' | 'koli_ustu'

export interface DocumentForEdit {
  id: number
  type_key: DocumentTypeKey
  operation_id: number | null
  language: string
  data: Record<string, unknown>
}

/** Mevcut bir belgeyi düzenlemek için yükler (data + tip + dil + operasyon). */
export function useDocumentForEdit(id: number | null) {
  return useQuery({
    queryKey: ['document-edit', id],
    enabled: id != null,
    queryFn: async (): Promise<DocumentForEdit> => {
      const { data, error } = await supabase.from('documents')
        .select('id, operation_id, language, data, document_types(key)')
        .eq('id', id as number).is('deleted_at', null).single()
      if (error) throw error
      const row = data as unknown as { id: number; operation_id: number | null; language: string; data: Record<string, unknown>; document_types: { key: string } | null }
      return { id: row.id, operation_id: row.operation_id, language: row.language, data: row.data ?? {}, type_key: (row.document_types?.key ?? 'fiyat_teklifi') as DocumentTypeKey }
    },
  })
}

// Şablon sürümleri — data_hash'e girer. Bir şablonu düzeltirsek burayı artır ki
// eski önbellek dönmesin (kullanıcı düzeltmesi: hash = veri + dil + şablon sürümü).
export const TEMPLATE_VERSIONS: Record<DocumentTypeKey, string> = {
  fiyat_teklifi: '1', siparis_onay: '1', numune_etiketi: '1', siparis_formu: '1', koli_ustu: '1',
}

async function sha256hex(str: string): Promise<string> {
  const buf = new TextEncoder().encode(str)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface OperationDocument {
  id: number
  document_type_id: number
  type_key: string
  type_label: string
  version: number
  language: string
  file_id: number | null
  file_name: string | null
  storage_path: string | null
  generated_at: string | null
  created_at: string
}

interface RawDoc {
  id: number; document_type_id: number; version: number; language: string; file_id: number | null
  generated_at: string | null; created_at: string
  document_types: { key: string; label_tr: string } | null
  files: { original_name: string; storage_path: string } | null
}

/** Bir operasyonun üretilmiş belgeleri. */
export function useOperationDocuments(operationId: number | null) {
  return useQuery({
    queryKey: ['documents', operationId],
    enabled: operationId != null,
    queryFn: async (): Promise<OperationDocument[]> => {
      const { data, error } = await supabase.from('documents')
        .select('id, document_type_id, version, language, file_id, generated_at, created_at, document_types(key, label_tr), files(original_name, storage_path)')
        .eq('operation_id', operationId as number).is('deleted_at', null).order('created_at', { ascending: false })
      if (error) throw error
      return ((data ?? []) as unknown as RawDoc[]).map((d) => ({
        id: d.id, document_type_id: d.document_type_id, version: d.version, language: d.language,
        file_id: d.file_id, generated_at: d.generated_at, created_at: d.created_at,
        type_key: d.document_types?.key ?? '', type_label: d.document_types?.label_tr ?? '',
        file_name: d.files?.original_name ?? null, storage_path: d.files?.storage_path ?? null,
      }))
    },
  })
}

/**
 * Belgeyi MANTIKSAL siler (deleted_at/deleted_by). Fiyat teklifi ise ilişkili teklif kaydını
 * da siler → quotes_sync_operation_status trigger'ı operasyonu 'teklif_bekliyor'a döndürür (A8).
 */
export function useDeleteDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, operationId, typeKey, fileId }:
      { id: number; operationId: number | null; typeKey: string; fileId: number | null }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const now = new Date().toISOString()
      ensureRows(await supabase.from('documents').update({ deleted_at: now, deleted_by: user?.id ?? null } as never).eq('id', id).select('id'))
      if (typeKey === 'fiyat_teklifi' && operationId != null && fileId != null) {
        await supabase.from('quotes').update({ deleted_at: now, deleted_by: user?.id ?? null } as never)
          .eq('operation_id', operationId).eq('quote_file_id', fileId).is('deleted_at', null)
      }
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['documents-list'] })
      qc.invalidateQueries({ queryKey: ['documents', v.operationId] })
      qc.invalidateQueries({ queryKey: ['operation', v.operationId] })
      qc.invalidateQueries({ queryKey: ['quotes', v.operationId] })
    },
  })
}

export interface GenerateResult { document_id: number; file_id: number | null; idempotent: boolean }

/**
 * Belge üret: build_document_data (iç-not güvenli) → data_hash idempotency →
 * PDF servisi → Storage → documents kaydı. Fiyat teklifinde quote+dosya (durum → teklif_iletildi).
 */
export function useGenerateDocument() {
  const qc = useQueryClient()
  const upload = useUploadFile()
  return useMutation({
    mutationFn: async ({ operationId, typeKey, language = 'tr', data }:
      { operationId: number | null; typeKey: DocumentTypeKey; language?: string; data?: Record<string, unknown> }): Promise<GenerateResult> => {
      // 1. Render verisi: düzenlenmiş verilirse onu kullan, yoksa DB'den topla (iç-not güvenli).
      //    Bağımsız belgede (operationId yok) editörden gelen data zorunludur.
      let docData = data
      if (!docData) {
        if (operationId == null) throw new Error('Bağımsız belge için veri gerekli.')
        const { data: built, error } = await supabase.rpc('build_document_data', { p_operation_id: operationId, p_type: typeKey, p_language: language })
        if (error) throw error
        docData = built as Record<string, unknown>
      }
      // İç not/editör-içi alanlar PDF'e GİRMEZ (QA#10 sızıntı koruması); kayıtta korunur.
      const renderData = stripInternal(docData)
      // 2. data_hash = RENDER verisi (PDF kimliği) + dil + şablon sürümü — iç not değişimi PDF'i değiştirmez
      const hash = await sha256hex(JSON.stringify(renderData) + '|' + language + '|' + TEMPLATE_VERSIONS[typeKey])
      // 3. tip
      const { data: dt, error: dtErr } = await supabase.from('document_types').select('id, template_name').eq('key', typeKey).single()
      if (dtErr) throw dtErr
      // 4. idempotency — aynı operasyon+hash varsa yeniden üretme (bağımsızlar hep yeni üretilir)
      if (operationId != null) {
        const { data: existing } = await supabase.from('documents')
          .select('id, file_id').eq('operation_id', operationId).eq('document_type_id', dt.id).eq('data_hash', hash).is('deleted_at', null).limit(1).maybeSingle()
        if (existing?.file_id) { qc.invalidateQueries({ queryKey: ['documents', operationId] }); return { document_id: existing.id, file_id: existing.file_id, idempotent: true } }
      }
      // 5. PDF servisi → bytes (servis yoksa net mesaj — sessiz hata değil)
      if (!hasPdfService) throw new Error(PDF_UNAVAILABLE)
      const res = await fetch(env.pdfServiceUrl.replace(/\/$/, '') + '/render', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ template: dt.template_name, data: docData, language }),
      })
      if (!res.ok) throw new Error(`PDF servisi hatası (${res.status}). Servis çalışıyor mu? (${env.pdfServiceUrl})`)
      const blob = await res.blob()
      const file = new File([blob], `${typeKey}-${operationId ?? Date.now()}.pdf`, { type: 'application/pdf' })
      // 6. Storage + files
      const uploaded = await upload.mutateAsync({ file, bucket: 'documents', category: 'document', entityType: 'operation', entityId: operationId != null ? String(operationId) : 'bagimsiz' })
      // 7. documents kaydı
      const { data: { user } } = await supabase.auth.getUser()
      const rows = ensureRows(await supabase.from('documents').insert({
        operation_id: operationId, document_type_id: dt.id, language, data: docData, data_hash: hash,
        file_id: uploaded.id, generated_by: user?.id ?? null, generated_at: new Date().toISOString(),
      } as never).select('id'))
      const documentId = (rows as { id: number }[])[0]!.id
      // 8. Fiyat teklifi (operasyona bağlıysa): quote + dosya → trigger durumu teklif_iletildi yapar.
      if (typeKey === 'fiyat_teklifi' && operationId != null) {
        await supabase.from('quotes').insert({ operation_id: operationId, quote_file_id: uploaded.id } as never)
      }
      return { document_id: documentId, file_id: uploaded.id, idempotent: false }
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['documents', v.operationId] })
      qc.invalidateQueries({ queryKey: ['quotes', v.operationId] })
      qc.invalidateQueries({ queryKey: ['operation', v.operationId] })
      qc.invalidateQueries({ queryKey: ['files', 'operation', String(v.operationId)] })
    },
  })
}
