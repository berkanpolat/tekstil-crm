// Sipariş formu belgesi (documents.data.sip) → orders + order_items deterministik eşleme.
// AI/çıkarım YOK: veri zaten yapılandırılmış. Saf mantık (test edilebilir); DB yazımı
// hook'larda (useOrders). Totaller JS'te HESAPLANMAZ — order_items insert'i mevcut
// recompute_order_totals trigger'ını tetikler.
import { parseDecimal } from './money'

export interface PaymentTermRef { id: number; key: string; label: string; is_default?: boolean }

export interface OrderDocItem {
  name: string
  description: string | null
  quantity: number
  unit: string
  unit_price: number
  sort_order: number
}

export interface OrderDocMapping {
  fields: {
    currency: string
    promised_delivery: string | null
    payment_term_id: number | null
    production_notes: string | null
    delivery_address: string | null
    tax_rate: number
  }
  items: OrderDocItem[]
  /** "Çekilen bilgiler" şeridi + extracted_data için özet (eski gösterimle uyumlu). */
  summary: Record<string, string>
  paymentText: string | null
  paymentMatched: boolean
  /** Birim fiyat okunamadı → kalemler 0 fiyatla yazıldı (uyarı için). */
  priceMissing: boolean
}

const str = (v: unknown): string => (v == null ? '' : String(v)).trim()

/**
 * Ödeme koşulu serbest metnini payment_terms'e eşler (anahtar kelime). Bulunamazsa is_default.
 * matched=false → çağıran "eşleşmedi, varsayılan kullanıldı" uyarısı gösterir (sessiz geçme yok).
 * Boş metin → sessiz varsayılan (eşleştirilecek bir şey yok, uyarı verilmez).
 */
export function resolvePaymentTerm(
  odeme: string | null | undefined,
  terms: PaymentTermRef[],
): { id: number | null; matched: boolean } {
  const def = terms.find((t) => t.is_default) ?? terms[0] ?? null
  const raw = (odeme ?? '').toLocaleLowerCase('tr').trim()
  if (!raw) return { id: def?.id ?? null, matched: true }
  const has = (...ws: string[]) => ws.some((w) => raw.includes(w))
  const fifties = (raw.match(/50/g) ?? []).length
  let key: string | null = null
  if (fifties >= 2 || (has('50') && has('ön ödeme', 'on odeme', 'peşin', 'pesin', 'sevkiyat', 'teslimat'))) key = 'yuzde_50_50'
  else if (has('peşin', 'pesin')) key = 'pesin'
  else if (has('vade', '30 gün', '30 gun')) key = 'vadeli_30'
  const found = key ? terms.find((t) => t.key === key) : null
  if (found) return { id: found.id, matched: true }
  return { id: def?.id ?? null, matched: false }
}

/** documents.data.sip → orders alanları + order_items satırları. */
export function buildOrderFromDoc(
  sip: Record<string, unknown>,
  ctx: { paymentTerms: PaymentTermRef[]; defaultTaxRate: number },
): OrderDocMapping {
  const para = str(sip.para) || 'TRY'
  const teslim = str(sip.teslim) || null
  const price = parseDecimal(sip.birim as string | number | null | undefined)
  const unitPrice = price != null && price > 0 ? price : 0
  const pay = resolvePaymentTerm(str(sip.odeme) || null, ctx.paymentTerms)

  // production_notes: kompozisyon + yorum + bakım + tavsiye satış fiyatı
  const notes: string[] = []
  if (str(sip.kompozisyon)) notes.push(`Kompozisyon: ${str(sip.kompozisyon)}`)
  if (str(sip.yorum)) notes.push(str(sip.yorum))
  const bakim = Array.isArray(sip.bakim) ? (sip.bakim as unknown[]).map(str).filter(Boolean) : []
  if (bakim.length) notes.push(`Bakım: ${bakim.join(', ')}`)
  if (str(sip.tavsiye)) notes.push(`Tavsiye satış fiyatı: ${str(sip.tavsiye)} ${para}`.trim())

  // order_items: renk başına 1 satır (qty = Σbeden). Beden kırılımı description'a metin.
  const renkler = Array.isArray(sip.renkler) ? (sip.renkler as Record<string, unknown>[]) : []
  const items: OrderDocItem[] = []
  const colorNames: string[] = []
  renkler.forEach((r, i) => {
    const q = (r.q ?? {}) as Record<string, unknown>
    let total = 0
    const parts: string[] = []
    for (const [beden, val] of Object.entries(q)) {
      const n = parseDecimal(val as string | number) ?? 0
      if (n > 0) { total += n; parts.push(`${beden}: ${n}`) }
    }
    if (total <= 0) return
    const ad = str(r.ad) || `Renk ${i + 1}`
    colorNames.push(ad)
    items.push({ name: ad, description: parts.length ? parts.join(' · ') : null, quantity: total, unit: 'adet', unit_price: unitPrice, sort_order: i })
  })
  // Renk yoksa toplam×birim tek kalem.
  if (items.length === 0) {
    const toplam = parseDecimal(sip.toplam as string | number | null | undefined)
    if (toplam != null && toplam > 0) items.push({ name: 'Sipariş kalemi', description: null, quantity: toplam, unit: 'adet', unit_price: unitPrice, sort_order: 0 })
  }

  const totalQty = items.reduce((a, it) => a + it.quantity, 0)
  const summary: Record<string, string> = {
    adet: totalQty ? String(totalQty) : str(sip.toplam),
    fiyat: str(sip.birim),
    renk: colorNames.join(', '),
    teslimat: teslim ?? '',
    odeme: str(sip.odeme),
  }

  return {
    fields: {
      currency: para,
      promised_delivery: teslim,
      payment_term_id: pay.id,
      production_notes: notes.join('\n') || null,
      delivery_address: str((sip.alici as Record<string, unknown> | undefined)?.adres) || null,
      tax_rate: ctx.defaultTaxRate,
    },
    items,
    summary,
    paymentText: str(sip.odeme) || null,
    paymentMatched: pay.matched,
    priceMissing: !(price != null && price > 0) && items.length > 0,
  }
}
