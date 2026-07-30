/**
 * YZ payload kurucuları (P6.6 izin-listesi). Modele giden veri BURADA, yalnız İZİNLİ
 * alanlardan kurulur. Maliyet/finans/iç-not alanları HİÇ OKUNMAZ — kaynak nesne onları
 * içerse bile payload'a girmez. Her kurucu yapısal özet (input_summary) döndürür.
 */

export interface AiPayload {
  feature: string
  entity_type: string | null
  entity_id: number | null
  fields_sent: string[]
  record_counts: Record<string, number>
  input_chars: number
  text: string
  pdfBase64?: string   // sipariş çıkarma: PDF doğrudan modele (Anthropic yerel PDF)
}

/** Anthropic PDF sınırı ~32MB istek / 100 sayfa. base64 ~%33 şişirir → ham PDF ≤ 20MB tutulur. */
export const AI_MAX_PDF_BYTES = 20 * 1024 * 1024

// "Uydurma" kuralı her prompt'a gömülür (Kabul 14).
export const AI_NO_HALLUCINATION = 'Yalnızca verilen bilgiye dayan. Emin olmadığın ya da veride olmayan bir bilgiyi UYDURMA; bilinmiyorsa "bulunamadı" de.'

const pick = (o: Record<string, unknown>, keys: readonly string[]) => {
  const out: Record<string, unknown> = {}
  for (const k of keys) if (o?.[k] != null && o[k] !== '') out[k] = o[k]
  return out
}

// ── Müşteri özeti (P6.8) — İZİNLİ: kimlik/konum + AÇIK notlar + görüşmeler ────
// YASAK (okunmaz): cari bakiye, sipariş/ödeme tutarları, maliyet, İÇ NOTLAR.
const ALLOWED_CUSTOMER = ['company_name', 'full_name', 'city', 'customer_type_label'] as const
export interface SummaryData {
  customer: Record<string, unknown>
  notes?: Array<Record<string, unknown>>
  interactions?: Array<Record<string, unknown>>
}
export function buildCustomerSummaryPayload(d: SummaryData): AiPayload {
  const c = d.customer ?? {}
  const picked = pick(c, ALLOWED_CUSTOMER)
  // İÇ NOTLAR ELENİR (is_internal=true). Yalnız müşteriyle paylaşılabilir notlar.
  const notes = (d.notes ?? []).filter((n) => n.is_internal !== true).map((n) => String(n.body ?? '').trim()).filter(Boolean)
  const ints = (d.interactions ?? []).map((i) => String(i.summary ?? i.note ?? '').trim()).filter(Boolean)
  const lines = [
    `Müşteri: ${picked.company_name ?? picked.full_name ?? '—'}`,
    picked.city ? `Şehir: ${picked.city}` : '',
    notes.length ? `Notlar:\n${notes.map((n) => '- ' + n).join('\n')}` : '',
    ints.length ? `Görüşmeler:\n${ints.map((n) => '- ' + n).join('\n')}` : '',
  ].filter(Boolean)
  const text = lines.join('\n')
  return {
    feature: 'musteri_ozeti', entity_type: 'customer', entity_id: Number(c.id) || null,
    fields_sent: [...Object.keys(picked), ...(notes.length ? ['notes'] : []), ...(ints.length ? ['interactions'] : [])],
    record_counts: { notes: notes.length, interactions: ints.length }, input_chars: text.length, text,
  }
}

// ── Talep analizi (P6.8) — İZİNLİ: yalnız talep başlığı + açıklaması (serbest metin) ─
export function buildTalepAnalysisPayload(d: { operation: Record<string, unknown> }): AiPayload {
  const o = d.operation ?? {}
  const picked = pick(o, ['title', 'description'])
  const text = [picked.title ? `Başlık: ${picked.title}` : '', picked.description ? `Açıklama: ${picked.description}` : ''].filter(Boolean).join('\n')
  return {
    feature: 'talep_analizi', entity_type: 'operation', entity_id: Number(o.id) || null,
    fields_sent: Object.keys(picked), record_counts: {}, input_chars: text.length, text,
  }
}

// ── Sipariş formundan bilgi çekme (P6.7) — İZİNLİ: yalnız PDF metni ───────────
export function buildOrderExtractionPayload(d: { orderId: number; pdfText: string }): AiPayload {
  const text = String(d.pdfText ?? '')
  return {
    feature: 'siparis_cikarma', entity_type: 'order', entity_id: Number(d.orderId) || null,
    fields_sent: ['pdf_text'], record_counts: {}, input_chars: text.length, text,
  }
}

// ── Rapor yorumu (P7.11) — YALNIZ operasyonel özet sayılar ───────────────────
// Para/isim/kişisel veri GİRMEZ (finans dışıdır). Model sadece sayıları yorumlar.
export interface ReportSummaryInput {
  period: string
  requests?: { total: number; prev_total: number; sla_rate: number; sla_met: number; sla_missed: number; sla_pending: number; avg_response_hours: number | null }
  quotes?: { sent: number; accepted: number; rejected: number; pending: number; conversion: number | null }
  funnel?: { requests: number; quotes: number; samples: number; orders: number }
}
export function buildReportInterpretationPayload(s: ReportSummaryInput): AiPayload {
  const L: string[] = [`Dönem: ${s.period}`]
  if (s.requests) L.push(
    `Talep: ${s.requests.total} (önceki dönem ${s.requests.prev_total})`,
    `24 saat sözü: %${s.requests.sla_rate.toFixed(0)} (${s.requests.sla_met} tuttu, ${s.requests.sla_missed} kaçtı, ${s.requests.sla_pending} sürüyor)`,
    s.requests.avg_response_hours != null ? `Ortalama ilk yanıt: ${s.requests.avg_response_hours.toFixed(1)} saat` : '')
  if (s.quotes) L.push(
    `Teklif: ${s.quotes.sent} gönderildi, ${s.quotes.accepted} kabul, ${s.quotes.rejected} red, ${s.quotes.pending} cevap bekliyor`,
    s.quotes.conversion != null ? `Teklif dönüşümü (sonuçlananlarda): %${s.quotes.conversion.toFixed(0)}` : '')
  if (s.funnel) L.push(`Huni: ${s.funnel.requests} talep → ${s.funnel.quotes} teklif → ${s.funnel.samples} numune → ${s.funnel.orders} sipariş`)
  const text = L.filter(Boolean).join('\n')
  return {
    feature: 'rapor_yorumu', entity_type: null, entity_id: null,
    fields_sent: ['operasyonel_ozet'], record_counts: {}, input_chars: text.length, text,
  }
}
