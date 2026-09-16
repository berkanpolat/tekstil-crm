// refresh-rates — TCMB kurunu BAĞIMSIZ çeker (PDF servisine bağlı değil).
// Paket C · Aşama 2. pg_cron hafta içi 16:00 TR'de (announce sonrası) çağırır.
// - TCMB TARİHLİ bülteni okur (/kurlar/YYYYMM/DDMMYYYY.xml); hafta sonu/tatilde
//   en yakın önceki iş gününe yürür (404 → geri).
// - ForexSelling (Döviz Satış) + bültenin kendi <Tarih>'i alınır.
// - system_set_exchange_rate ile yazılır (bülten tarihi damgalanır; mükerrer korumalı).
// Güvenlik: x-refresh-secret başlığı REFRESH_SECRET ile eşleşmezse 401.
//   İçeride SERVICE_ROLE ile DB'ye yazılır (is_active_user kapısını sistem yolu aşar).
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { adminClient } from '../_shared/auth.ts'

const CURRENCIES = ['USD', 'EUR', 'GBP'] as const
type Cur = (typeof CURRENCIES)[number]

/** ForexSelling (Döviz Satış) — tarihli bülten XML'inden. */
function pickForexSelling(xml: string, code: string): number | null {
  const m = xml.match(new RegExp('<Currency[^>]*CurrencyCode="' + code + '"[\\s\\S]*?<ForexSelling>([\\d.]+)</ForexSelling>'))
  return m ? Number(m[1]) : null
}
/** Bülten tarihi: kök öğedeki Tarih="DD.MM.YYYY" → YYYY-MM-DD. */
function bulletinDateOf(xml: string): string | null {
  const m = xml.match(/Tarih="(\d{2})\.(\d{2})\.(\d{4})"/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

/** İstanbul (UTC+3, DST yok) bugünün Y/A/G bileşenleri. */
function istanbulToday(): { yyyy: number; mm: string; dd: string } {
  const ist = new Date(Date.now() + 3 * 3600 * 1000)
  return { yyyy: ist.getUTCFullYear(), mm: String(ist.getUTCMonth() + 1).padStart(2, '0'), dd: String(ist.getUTCDate()).padStart(2, '0') }
}

/** Bugünden geriye en yakın yayınlı TCMB bültenini bulur (max 10 gün). */
async function fetchLatestBulletin(): Promise<{ xml: string; date: string } | null> {
  const base = new Date(Date.now() + 3 * 3600 * 1000) // İstanbul
  for (let back = 0; back <= 10; back++) {
    const d = new Date(base.getTime() - back * 864e5)
    const dd = String(d.getUTCDate()).padStart(2, '0')
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
    const yyyy = d.getUTCFullYear()
    const url = `https://www.tcmb.gov.tr/kurlar/${yyyy}${mm}/${dd}${mm}${yyyy}.xml`
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(6000) })
      if (r.status === 404) continue
      if (!r.ok) throw new Error('tcmb ' + r.status)
      const xml = await r.text()
      if (pickForexSelling(xml, 'USD') == null) continue
      const date = bulletinDateOf(xml) ?? `${yyyy}-${mm}-${dd}`
      return { xml, date }
    } catch (_e) { /* sonraki güne yürü */ }
  }
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Kimlik: paylaşılan gizli anahtar (cron → edge fn). JWT yok (verify_jwt=false).
  const secret = Deno.env.get('REFRESH_SECRET')
  if (!secret || req.headers.get('x-refresh-secret') !== secret) {
    return jsonResponse({ error: 'unauthorized' }, 401)
  }

  const bulletin = await fetchLatestBulletin()
  if (!bulletin) return jsonResponse({ error: 'tcmb_unavailable' }, 502)

  const db = adminClient()
  const results: Record<string, unknown> = { rate_date: bulletin.date }
  for (const cur of CURRENCIES) {
    const rate = pickForexSelling(bulletin.xml, cur as Cur)
    if (rate == null) { results[cur] = 'parse_failed'; continue }
    const { data, error } = await db.rpc('system_set_exchange_rate', {
      p_currency: cur, p_rate: rate, p_source: 'TCMB', p_rate_date: bulletin.date,
    })
    results[cur] = error ? `error: ${error.message}` : (data ?? 'ok')
  }
  return jsonResponse({ ok: true, ...results })
})
