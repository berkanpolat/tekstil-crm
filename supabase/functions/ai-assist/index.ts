// ai-assist — TÜM yapay zekâ çağrılarının TEK KAPISI (P6.6).
// Sebep: yetki, veri ayıklama (guard), kayıt (ai_requests), maliyet (günlük sınır).
// ANTHROPIC_API_KEY yalnız burada okunur; istemciye ASLA inmez.
//
// Veri güvenliği: maliyet/finans/iç-not modele GİTMEZ. İki katman:
//   (1) izin-listesi — istemci (aiPayloads) yalnız izinli alandan payload kurar,
//   (2) bu guard — payload'da yasak ANAHTAR görürse çağrıyı REDDEDER (status='blocked').
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { adminClient, authenticateCaller, HttpError } from '../_shared/auth.ts'

// aiGuard.ts ile AYNI liste (Deno src import edemez → çoğaltıldı). İkisi senkron tutulmalı.
const AI_FORBIDDEN_KEYS = [
  'internalnote', 'internal_note', 'is_internal',
  'cost', 'unit_cost', 'total_cost', 'total_cost_try', 'total_cost_usd', 'product_cost', 'cost_id', 'costitems', 'cost_items',
  'margin', 'margin_percent', 'custom_margin_percent',
  'amount_try', 'amount_usd', 'balance_try', 'balance_usd', 'unit_price', 'exchange_rate', 'usd_rate',
  'account_transaction', 'account_transactions', 'payments', 'payment', 'odeme', 'tahsilat', 'ciro', 'bakiye',
]
function scanForbiddenKeys(value: unknown): string[] {
  const hits = new Set<string>()
  const walk = (v: unknown) => {
    if (Array.isArray(v)) { v.forEach(walk); return }
    if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (AI_FORBIDDEN_KEYS.includes(k.toLowerCase().replace(/[^a-z_]/g, ''))) hits.add(k)
        walk(val)
      }
    }
  }
  walk(value)
  return [...hits]
}

const NO_HALLUCINATION = 'Yalnızca verilen bilgiye dayan. Veride olmayan bir bilgiyi UYDURMA; bilinmiyorsa "bulunamadı" de.'
const SYSTEM_PROMPTS: Record<string, string> = {
  musteri_ozeti: `Sen bir tekstil CRM asistanısın. Verilen müşteri bilgisi ve notlardan KISA (3-5 cümle) Türkçe bir özet çıkar: müşterinin ilgi alanı, geçmiş etkileşimlerin özü. ${NO_HALLUCINATION}`,
  talep_analizi: `Bir üretim talebi metnini analiz et. Şu alanları JSON olarak çıkar: urun_tipi, adet, renkler (dizi), notlar. ${NO_HALLUCINATION} Bulamadığın alanı null bırak. Yalnız JSON döndür.`,
  siparis_cikarma: `Bir sipariş formu PDF'inden alanları çıkar. Her alan için {"value": ..., "source": "PDF'te bunu okuduğun kısa metin parçası"} döndür. Alanlar: adet (sayı), birim_fiyat (sayı), renkler (dizi), bedenler (dizi), toplam_tutar (sayı), teslim_tarihi (YYYY-MM-DD), odeme_kosulu (metin). ${NO_HALLUCINATION} Bulamadığın alan için {"value": null, "source": null} ver — TAHMİN ETME. Yalnız şu biçimde JSON döndür: {"adet":{"value":..,"source":..}, ...}`,
  rapor_yorumu: `Sen bir tekstil CRM yönetim asistanısın. Sana bir dönemin ÖZET operasyonel metrikleri (yalnız sayılar) verilecek — müşteri adı, para tutarı veya kişisel veri YOK. Bunları 3-5 cümlelik, sade Türkçe bir yönetici yorumuna çevir: güçlü yönler, dikkat gereken noktalar ve en büyük darboğaz. ${NO_HALLUCINATION} Sayı uydurma; yalnız verilenleri yorumla. Öneri verebilirsin ama abartma.`,
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return 'sha256:' + [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const started = Date.now()
  const admin = adminClient()
  let userId: string | null = null
  try {
    const caller = await authenticateCaller(req)
    userId = caller.id
    const body = await req.json().catch(() => ({}))
    const feature: string = body?.feature ?? ''
    const payload = body?.payload ?? {}
    const text: string = String(payload?.text ?? '')
    const pdfB64: string | null = payload?.pdfBase64 ?? null
    if (!SYSTEM_PROMPTS[feature]) throw new HttpError(400, 'Bilinmeyen YZ özelliği.')

    // yapısal özet (metin/PDF saklanmaz) + payload_hash (kaynak: PDF varsa base64, yoksa metin)
    const hashSrc = pdfB64 ?? text
    const payloadHash = await sha256(hashSrc)
    const inputSummary = {
      feature, entity_type: payload?.entity_type ?? null, entity_id: payload?.entity_id ?? null,
      fields_sent: payload?.fields_sent ?? [], record_counts: payload?.record_counts ?? {},
      input_chars: hashSrc.length, payload_hash: payloadHash,
    }
    const logRow = (extra: Record<string, unknown>) => admin.from('ai_requests').insert({
      user_id: userId, feature, input_summary: inputSummary, payload_hash: payloadHash,
      duration_ms: Date.now() - started, ...extra,
    }).select('id').single()

    // (2) GUARD — yasak anahtar varsa reddet + logla
    const forbidden = scanForbiddenKeys(payload)
    if (forbidden.length) {
      await logRow({ status: 'blocked', response_summary: 'guard: ' + forbidden.join(',') })
      throw new HttpError(422, 'Güvenlik: bu istek finans/maliyet/iç-not içeriyor, gönderilmedi.')
    }

    // Ayarlar + sınırlar (adet + MALİYET + özellik-başı)
    const { data: settings } = await admin.from('settings').select('key, value')
      .in('key', ['ai.model', 'ai.daily_call_limit', 'ai.price_per_1m_input', 'ai.price_per_1m_output', 'ai.daily_cost_limit_usd', 'ai.monthly_cost_limit_usd', 'ai.limits'])
    const sMap = new Map((settings ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]))
    const model = String(sMap.get('ai.model') ?? 'claude-sonnet-4-6')
    const priceIn = Number(sMap.get('ai.price_per_1m_input') ?? 3)
    const priceOut = Number(sMap.get('ai.price_per_1m_output') ?? 15)
    const callLimit = Number(sMap.get('ai.daily_call_limit') ?? 500)
    const dailyCostLimit = Number(sMap.get('ai.daily_cost_limit_usd') ?? 5)
    const monthlyCostLimit = Number(sMap.get('ai.monthly_cost_limit_usd') ?? 50)
    const featureLimits = (sMap.get('ai.limits') ?? {}) as Record<string, { daily?: number }>

    const limited = (err: string) => { void logRow({ status: 'limit', model, response_summary: err }); return jsonResponse({ available: true, status: 'limit', error: err }, 200) }
    const [{ data: usedToday }, { data: costToday }, { data: costMonth }, { data: featToday }] = await Promise.all([
      admin.rpc('ai_calls_today'), admin.rpc('ai_cost_today'), admin.rpc('ai_cost_month'), admin.rpc('ai_feature_calls_today', { p_feature: feature }),
    ])
    if (Number(usedToday ?? 0) >= callLimit) return await limited('Günlük YZ çağrı sınırı doldu.')
    if (Number(costToday ?? 0) >= dailyCostLimit) return await limited('Günlük yapay zekâ bütçesi doldu.')
    if (Number(costMonth ?? 0) >= monthlyCostLimit) return await limited('Aylık yapay zekâ bütçesi doldu.')
    const fLimit = featureLimits?.[feature]?.daily
    if (fLimit && Number(featToday ?? 0) >= fLimit) return await limited('Bu özellik için günlük sınır doldu.')

    // Anahtar yoksa → sessiz devre dışı (uygulama çalışmaya devam eder)
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      await logRow({ status: 'unavailable', model, response_summary: 'anahtar yok' })
      return jsonResponse({ available: false }, 200)
    }

    // Anthropic çağrısı — PDF varsa yerel belge bloğu, yoksa düz metin
    const content = pdfB64
      ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfB64 } },
         { type: 'text', text: 'Yukarıdaki sipariş formunu analiz et ve istenen alanları çıkar.' }]
      : text
    let res: Response
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: 1024, system: SYSTEM_PROMPTS[feature], messages: [{ role: 'user', content }] }),
      })
    } catch {
      await logRow({ status: 'error', model, response_summary: 'ağ hatası' })
      return jsonResponse({ available: false }, 200)   // sessiz devre dışı
    }
    if (!res.ok) {
      await logRow({ status: 'error', model, response_summary: 'api ' + res.status })
      return jsonResponse({ available: false }, 200)
    }
    const data = await res.json()
    const out = (data?.content ?? []).map((c: { text?: string }) => c.text ?? '').join('')
    const tIn = data?.usage?.input_tokens ?? 0
    const tOut = data?.usage?.output_tokens ?? 0
    const cost = Math.round(((tIn / 1e6) * priceIn + (tOut / 1e6) * priceOut) * 1e5) / 1e5   // tahmini maliyet USD
    const row = await logRow({ status: 'ok', model, tokens_in: tIn, tokens_out: tOut, estimated_cost_usd: cost, response_summary: `ok · ${out.length} krk · $${cost}` })

    // Aylık bütçenin %80'i aşıldıysa yöneticilere BİR KEZ uyar (bu ay tekrar etmesin)
    try {
      const newMonth = Number(costMonth ?? 0) + cost
      if (monthlyCostLimit > 0 && newMonth >= 0.8 * monthlyCostLimit) {
        const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
        const { count } = await admin.from('notifications').select('id', { count: 'exact', head: true })
          .eq('type', 'ai_budget_alert').gte('created_at', monthStart.toISOString())
        if (!count) {
          const { data: mgrs } = await admin.from('users').select('id, roles!inner(key)').eq('is_active', true).is('deleted_at', null).in('roles.key', ['owner', 'admin', 'manager'])
          for (const m of (mgrs ?? []) as { id: string }[]) {
            await admin.from('notifications').insert({ user_id: m.id, type: 'ai_budget_alert', severity: 'warning',
              title: 'YZ bütçesi %80 aşıldı', body: `Bu ay YZ harcaması ~$${newMonth.toFixed(2)} / sınır $${monthlyCostLimit}.`, silent: true })
          }
        }
      }
    } catch { /* uyarı best-effort */ }

    return jsonResponse({ available: true, status: 'ok', result: out, request_id: row.data?.id ?? null })
  } catch (e) {
    if (e instanceof HttpError) return jsonResponse({ error: e.message }, e.status)
    console.error('[ai-assist]', e)
    return jsonResponse({ error: 'YZ isteği işlenemedi.' }, 500)
  }
})
