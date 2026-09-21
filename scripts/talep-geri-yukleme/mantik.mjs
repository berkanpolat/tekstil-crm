// =====================================================================
// TALEP GERİ YÜKLEME — SAF MANTIK (ağ yok, dosya yok; test edilir)
//
// Kaynaklar:
//   B  leads.jsonl        → siteden gelen her form (referans liste)
//   A  audit_log.old_values → 16 Eyl 2026'da silinen CRM talepleri (eski kod)
//   C  Süreç Takip records → durum, atanan, not
//   D  Studio landing_leads → B'nin kopyası; B'de olmayanlar eklenir
// =====================================================================

/** Telefonu son 10 haneye indirger: '0532 725 12 15' → '5327251215'. */
export function telNorm(p) {
  const d = String(p ?? '').replace(/\D/g, '')
  return d.length >= 10 ? d.slice(-10) : d
}

/** E.164 (CRM intake_normalize_phone ile aynı sonuç): '5327251215' → '+905327251215'. */
export function telE164(p) {
  const n = telNorm(p)
  return n.length === 10 ? `+90${n}` : null
}

/**
 * lead.php'nin ürettiği "KOD Ad (2 renk), KOD Ad" dizgisini
 * intake_process'in beklediği selected_products dizisine çevirir.
 */
export function urunleriAyir(products) {
  if (!products || typeof products !== 'string') return []
  return products
    .split(/,\s*(?=[A-Z]{2,4}-)/) // yalnız yeni bir KOD-… ile başlayan virgülde böl
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^([A-Z0-9]{2,4}-[A-Z0-9-]+)\s*(.*?)(?:\s*\((\d+) renk\))?$/)
      if (!m) return { code: s, name: '' }
      return { code: m[1], name: m[2].trim(), ...(m[3] ? { renk: Number(m[3]) } : {}) }
    })
}

/**
 * B satırından edge fn / intake_process payload'u. client_reference,
 * lead.php ile aynı kalıpta: "<ts>-<sha1(tel)[0:8]>". sha1 dışarıdan verilir
 * (mantık dosyası crypto'ya bağımlı olmasın).
 */
export function payloadKur(b, sha1) {
  const tel = b.phone ? String(b.phone).trim() : ''
  return {
    client_reference: `${b.ts}-${sha1(tel).slice(0, 8)}`,
    full_name: b.name ?? null,
    city: b.city ?? null,
    phone: tel || null,
    email: b.email ?? null,
    mode: b.mode ?? null,
    source: b.source ?? null,
    note: b.note ?? null,
    selected_products: urunleriAyir(b.products),
  }
}

/** Aynı telefon + 3 dk içinde + aynı ürün/görsel → çift tıklama kopyası. */
export function kopyalariAyikla(rows) {
  const sorted = [...rows].sort((x, y) => x.ts.localeCompare(y.ts))
  const out = []
  const kopya = []
  for (const r of sorted) {
    const t = telNorm(r.phone)
    const son = [...out].reverse().find((o) => telNorm(o.phone) === t)
    if (
      son &&
      Math.abs(Date.parse(r.ts) - Date.parse(son.ts)) <= 3 * 60_000 &&
      (son.products ?? '') === (r.products ?? '') &&
      (son.image ?? '') === (r.image ?? '')
    ) {
      kopya.push({ ...r, kopyasi: son.ts })
      continue
    }
    out.push(r)
  }
  return { tekil: out, kopya }
}

/**
 * A (silinen CRM talepleri) ↔ B: client_reference "<ts>-…" ile başlar.
 * Aynı ts iki farklı telefonla gelmiş olabilir → sha1 son eki de karşılaştırılır.
 */
export function eskiKodBul(b, auditOps, sha1) {
  const ref = payloadKur(b, sha1).client_reference
  return auditOps.find((a) => a.client_reference === ref) ?? null
}

/**
 * Süreç Takip durumu → CRM'de izlenecek yol. CRM iki kademeli: DURUM (stage_statuses,
 * geçiş kuralları var) sürücü, AŞAMA ondan türer. Yeni talep st_teklif_bekliyor ile
 * doğar; buradan izinli geçişler sırayla uygulanır (uygulamanın kendi tetikleyicileri
 * numune/sipariş kayıtlarını açar). "Teklif reddedildi": aşama 11 pasif ve kapanış durumuna
 * geçiş kuralı yok → asama:'teklif_reddedildi' işareti yaz.mjs'te İPTAL (sebep+not) olarak uygulanır.
 */
export const DURUM_YOL = {
  'Teklif bekliyor':      { durumlar: [], asama: null },
  'Teklif iletildi':      { durumlar: ['st_teklif_iletildi'], asama: null },
  'Teklif reddedildi':    { durumlar: ['st_teklif_iletildi'], asama: 'teklif_reddedildi' },
  'Teklif onaylandı':     { durumlar: ['st_teklif_iletildi', 'st_num_hazirlaniyor'], asama: null },
  'Numune yapılıyor':     { durumlar: ['st_teklif_iletildi', 'st_num_hazirlaniyor'], asama: null },
  'Numune teslim edildi': { durumlar: ['st_teklif_iletildi', 'st_num_hazirlaniyor', 'st_num_kargoda', 'st_num_teslim'], asama: null },
  'Sipariş aşamasında':   { durumlar: ['st_teklif_iletildi', 'st_num_hazirlaniyor', 'st_num_kargoda', 'st_num_teslim', 'st_num_onaylandi', 'st_sip_alindi'], asama: null },
  'Teslim edildi':        { durumlar: ['st_teklif_iletildi', 'st_num_hazirlaniyor', 'st_num_kargoda', 'st_num_teslim', 'st_num_onaylandi', 'st_sip_alindi', 'st_ur_uretimde', 'st_tes_kargoda', 'st_tes_teslim', 'st_kap_tamamlandi'], asama: null },
}

/**
 * C ↔ B: telefon eşit, `date` (kayıt günü) B.ts'ye en yakın olan.
 * Bir C kaydı yalnız bir B'ye bağlanır (kullanılanlar `kullanilan` kümesine girer).
 * Tolerans: ±7 gün (ekip talebi geldikten günler sonra da açabiliyor).
 */
export function surecTakipEsle(b, legacyRecords, kullanilan = new Set()) {
  const t = telNorm(b.phone)
  if (!t) return null
  const gun = 86_400_000
  const tsMs = Date.parse(b.ts)
  const adaylar = legacyRecords
    .filter((r) => !kullanilan.has(r.id) && telNorm(r.customers?.phone) === t)
    .map((r) => ({ r, fark: Math.abs(Date.parse(`${r.date}T12:00:00Z`) - tsMs) }))
    .filter((x) => x.fark <= 7 * gun)
    .sort((x, y) => x.fark - y.fark)
  if (!adaylar.length) return null
  kullanilan.add(adaylar[0].r.id)
  return adaylar[0].r
}

/** D'de olup B'de olmayan telefonlar → B biçimine çevrilmiş satırlar. */
export function studioEksikleri(bRows, studioRows) {
  const var_ = new Set(bRows.map((r) => telNorm(r.phone)).filter(Boolean))
  const out = []
  for (const s of studioRows) {
    const t = telNorm(s.phone)
    if (!t || var_.has(t)) continue
    var_.add(t)
    const n = s.notes ?? ''
    const city = n.match(/Şehir:\s*(.+)/)?.[1]?.trim() ?? null
    const tip = n.match(/Talep tipi:\s*(.+)/)?.[1]?.trim() ?? ''
    const urunler = n.match(/Seçilen ürünler:\s*(.+)/)?.[1]?.trim() ?? ''
    const not = n.match(/Not:\s*([\s\S]+)/)?.[1]?.trim() ?? ''
    out.push({
      ts: new Date(s.created_at).toISOString().replace(/\.\d{3}Z$/, '+00:00'),
      name: s.full_name,
      city,
      phone: s.phone,
      email: s.email ?? null,
      mode: /Görsel/i.test(tip) ? 'upload' : 'catalog',
      source: s.source,
      note: not || null,
      // Studio "Ad (KOD)" yazar; lead.php "KOD Ad" → tek biçime çevir
      products: urunler
        ? urunler.split(/,\s*/).map((x) => {
            const m = x.match(/^(.*?)\s*\(([A-Z0-9-]+)\)$/)
            return m ? `${m[2]} ${m[1]}` : x
          }).join(', ')
        : '',
      image: null,
      kaynak_kayit: 'studio_landing',
    })
  }
  return out
}

/** Kullanıcı adı (Süreç Takip profili) → CRM e-postası. */
export function kullaniciEposta(fullName) {
  const k = String(fullName ?? '').toLowerCase()
  if (k.startsWith('affan')) return 'affan.ergul@tekstilas.com'
  if (k.startsWith('ayse')) return 'ayse.duzgun@tekstilas.com'
  if (k.startsWith('hakan')) return 'hakan.akgun@tekstilas.com'
  if (k.startsWith('polat')) return 'polat.cetiner@tekstilas.com'
  return null
}

const PERSONEL = new Set(['affan ergul', 'hakan gokce akgun', 'hakan akgun', 'tuna cardak', 'tuna test', 'tuna cardak test'])
const trSade = (s) => String(s ?? '').toLowerCase()
  .replace(/ı/g, 'i').replace(/ç/g, 'c').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o')
  .replace(/\s+/g, ' ').trim()

/**
 * Personelin/otomasyonun bıraktığı deneme kayıtları. Gerçek müşterinin uzun notunda
 * geçen "deneme üretim" gibi ifadeler TEST SAYILMAZ (not kısa ve tek başına olmalı).
 */
export function testMi(b) {
  const ad = trSade(b.name ?? b.full_name)
  const not = trSade(b.note)
  if (/^test\b/.test(ad)) return true
  if (PERSONEL.has(ad)) return true
  if (/dikkate almayin/.test(not)) return true
  if (not.length <= 24 && /\b(test|deneme)\b/.test(not) && not.split(' ').length <= 3) return true
  return false
}
