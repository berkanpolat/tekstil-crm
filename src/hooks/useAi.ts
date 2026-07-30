import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { assertNoForbidden } from '@/lib/aiGuard'
import { AI_MAX_PDF_BYTES, type AiPayload } from '@/lib/aiPayloads'
import { getSignedUrl } from '@/hooks/useFiles'

export interface AiResult { available: boolean; status?: 'ok' | 'limit'; result?: string; request_id?: number | null; error?: string }

export interface ExtractedField { value: unknown; source: string | null }
export type ExtractedFields = Record<string, ExtractedField>
export interface ExtractResult { available: boolean; status?: string; error?: string; fields?: ExtractedFields; request_id?: number | null }

/** P6.7 — Sipariş formu PDF'inden bilgi çek. Boyut kontrolü + PDF'i base64 modele → alan+kaynak. */
export function useExtractOrder() {
  return useMutation({
    mutationFn: async ({ orderId, storagePath, fileName }: { orderId: number; storagePath: string; fileName?: string | null }): Promise<ExtractResult> => {
      // 1) PDF indir + BOYUT KONTROLÜ (sessizce başarısız olmasın)
      const url = await getSignedUrl('documents', storagePath, 120, fileName ?? undefined)
      const blob = await (await fetch(url)).blob()
      if (blob.size > AI_MAX_PDF_BYTES) {
        throw new Error(`Bu dosya çok büyük (${(blob.size / 1048576).toFixed(1)} MB, sınır ${AI_MAX_PDF_BYTES / 1048576} MB). Elle giriş yapın.`)
      }
      const pdfBase64 = await new Promise<string>((res, rej) => {
        const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] ?? ''); r.onerror = () => rej(new Error('PDF okunamadı.')); r.readAsDataURL(blob)
      })
      // 2) izin-listesi payload (PDF doğrudan; guard yasak-anahtar denetler)
      const payload: AiPayload = { feature: 'siparis_cikarma', entity_type: 'order', entity_id: orderId, fields_sent: ['pdf'], record_counts: {}, input_chars: 0, text: '', pdfBase64 }
      assertNoForbidden({ ...payload, pdfBase64: '<pdf>' })   // pdf base64'ü guard'a değer olarak sokma
      // 3) ai-assist
      const { data, error } = await supabase.functions.invoke('ai-assist', { body: { feature: payload.feature, payload } })
      if (error) return { available: false }
      const r = data as AiResult
      if (!r.available || r.status === 'limit') return { available: r.available, status: r.status, error: r.error }
      // 4) JSON ayrıştır (model bazen ```json … ``` sarar)
      let fields: ExtractedFields = {}
      try { fields = JSON.parse(String(r.result ?? '{}').replace(/```json|```/g, '').trim()) } catch { /* boş bırak */ }
      return { available: true, status: 'ok', fields, request_id: r.request_id }
    },
  })
}

/** Tüm YZ çağrıları ai-assist edge fn üzerinden. Erişilemezse available:false → özellik sessiz kapanır. */
export function useAiAssist() {
  return useMutation({
    mutationFn: async (payload: AiPayload): Promise<AiResult> => {
      assertNoForbidden(payload)   // istemci ön-kontrolü (edge fn ayrıca denetler)
      const { data, error } = await supabase.functions.invoke('ai-assist', { body: { feature: payload.feature, payload } })
      if (error) return { available: false }   // fonksiyon erişilemez → sessiz devre dışı
      return data as AiResult
    },
  })
}

/** Öneri kabul/red + DÜZELTİLEN alanlar (Faz 7 analizine; model zayıflığı). */
export function useAiFeedback() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ requestId, accepted, reason, correctedFields }: { requestId: number; accepted: boolean; reason?: string; correctedFields?: string[] }) =>
      supabase.from('ai_requests').update({ accepted, rejected_reason: accepted ? null : (reason ?? null), corrected_fields: correctedFields ?? null }).eq('id', requestId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-calls-today'] }),
  })
}

export interface AiSpend {
  today_usd: number; month_usd: number; daily_limit: number; monthly_limit: number
  by_feature: { feature: string; calls: number; usd: number }[]
  top_users: { name: string; calls: number; usd: number }[]
}
/** YZ harcama özeti (Ayarlar → Yapay Zekâ). owner/admin. */
export function useAiSpend() {
  return useQuery({
    queryKey: ['ai-spend'], staleTime: 30_000,
    queryFn: async (): Promise<AiSpend | null> => { const { data, error } = await supabase.rpc('ai_spend_summary'); if (error) throw error; return data as unknown as AiSpend },
  })
}

/** Bugünkü genel YZ çağrı sayısı (kalan hak göstergesi). */
export function useAiCallsToday() {
  return useQuery({
    queryKey: ['ai-calls-today'], staleTime: 60_000,
    queryFn: async (): Promise<number> => { const { data } = await supabase.rpc('ai_calls_today'); return Number(data ?? 0) },
  })
}
