// ssrf.ts — dış URL indirmeleri için SSRF savunması.
//
// SAST 1 Eyl 2026 (Kritik): intake-request'te `file_url` yalnız .trim() görüp
// doğrudan fetch ediliyordu. Yanıt Storage'a yazıldığı için kör değil OKUNABİLİR
// SSRF'ti — Edge Runtime'dan bulut metadata servisine (169.254.169.254) ve iç
// servislere erişilip içerik geri okunabiliyordu.
//
// Savunma katmanları:
//   1) yalnız http/https, URL'de kimlik bilgisi yok, port kısıtlı
//   2) host bir IP ise: özel/ayrılmış aralıklar reddedilir
//   3) host bir ad ise: DNS çözümlenip TÜM kayıtlar aynı kontrolden geçirilir
//      (DNS rebinding'e karşı; çözüm başarısızsa istek reddedilir)
//   4) yönlendirmeler elle izlenir; her adım baştan doğrulanır (302 ile iç ağa
//      sıçrama engellenir)

export type SsrfSonuc = { ok: true; url: URL } | { ok: false; sebep: string }

// Bu modül Deno (Supabase Edge) altında çalışır; birim testleri Node/vitest
// altında koştuğu için global doğrudan değil, tipli bir erişimci üzerinden okunur.
type DnsCozucu = (host: string, tip: 'A' | 'AAAA') => Promise<string[]>
function dnsCozucu(): DnsCozucu | null {
  const d = (globalThis as { Deno?: { resolveDns?: DnsCozucu } }).Deno
  return typeof d?.resolveDns === 'function' ? d.resolveDns.bind(d) : null
}

const IZINLI_SEMALAR = new Set(['http:', 'https:'])
const IZINLI_PORTLAR = new Set(['', '80', '443', '8080', '8443'])

/** Sunucu adı olarak asla kabul edilmeyecek adlar. */
const YASAK_ADLAR = [
  'localhost', 'metadata', 'metadata.google.internal', 'instance-data',
]
const YASAK_SONEKLER = ['.local', '.internal', '.localdomain', '.home.arpa']

function ipv4Ayristir(s: string): number[] | null {
  const p = s.split('.')
  if (p.length !== 4) return null
  const n = p.map((x) => (/^\d{1,3}$/.test(x) ? Number(x) : -1))
  return n.every((x) => x >= 0 && x <= 255) ? n : null
}

/** Özel / ayrılmış / yönlendirilemez IPv4 mü? */
function ipv4Ozel(n: number[]): boolean {
  const [a, b] = n as [number, number, number, number]
  if (a === 0) return true                        // 0.0.0.0/8
  if (a === 10) return true                       // özel
  if (a === 127) return true                      // loopback
  if (a === 169 && b === 254) return true         // link-local + BULUT METADATA
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 192 && b === 0) return true           // 192.0.0.0/24, 192.0.2.0/24
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a === 198 && b === 51) return true          // 198.51.100.0/24
  if (a === 203 && b === 0) return true           // 203.0.113.0/24
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a >= 224) return true                       // multicast + ayrılmış
  return false
}

/**
 * IPv6 metnini 8 adet 16-bit gruba açar. Karma gösterim (::ffff:1.2.3.4) da
 * desteklenir. Çözülemezse null.
 */
function ipv6Gruplar(s: string): number[] | null {
  let h = s.toLowerCase().replace(/^\[|\]$/g, '')
  if (h.includes('%')) h = h.split('%')[0] ?? ''    // bölge kimliği (fe80::1%eth0)

  // Karma gösterim: son parça IPv4 ise iki 16-bit gruba çevir.
  const nokta = h.lastIndexOf(':')
  const kuyruk = h.slice(nokta + 1)
  if (kuyruk.includes('.')) {
    const v4 = ipv4Ayristir(kuyruk)
    if (!v4) return null
    const [a, b, c, d] = v4 as [number, number, number, number]
    h = h.slice(0, nokta + 1)
      + (((a << 8) | b) >>> 0).toString(16) + ':'
      + (((c << 8) | d) >>> 0).toString(16)
  }

  const yarim = h.split('::')
  if (yarim.length > 2) return null
  const solHam = yarim[0] ?? ''
  const sagHam = yarim[1]
  const sol = solHam ? solHam.split(':') : []
  const sag = yarim.length === 2 ? (sagHam ? sagHam.split(':') : []) : null

  let parca: string[]
  if (sag === null) { parca = sol }
  else {
    const bosluk = 8 - sol.length - sag.length
    if (bosluk < 0) return null
    parca = [...sol, ...Array(bosluk).fill('0'), ...sag]
  }
  if (parca.length !== 8) return null

  const g = parca.map((x) => (/^[0-9a-f]{1,4}$/.test(x) ? parseInt(x, 16) : -1))
  return g.every((x) => x >= 0) ? g : null
}

function ipv6Ozel(s: string): boolean {
  const g = ipv6Gruplar(s)
  if (!g) return true                                    // ayrıştırılamadı → güvenli tarafta kal

  const hepsiSifir = g.every((x) => x === 0)
  if (hepsiSifir) return true                            // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true   // ::1 loopback

  // IPv4-eşlenmiş (::ffff:a.b.c.d) ve IPv4-uyumlu (::a.b.c.d):
  // NOT: URL ayrıştırıcısı `::ffff:169.254.169.254` metnini `::ffff:a9fe:a9fe`
  // biçimine normalize eder — bu yüzden ondalık kalıp aramak YETMEZ, gruplardan
  // çözmek gerekir (SAST regresyon testi bu açığı yakaladı).
  const [g0, , , , , g5, g6, g7] = g as [number, number, number, number, number, number, number, number]
  if (g.slice(0, 5).every((x) => x === 0) && (g5 === 0xffff || g5 === 0)) {
    return ipv4Ozel([g6 >> 8, g6 & 0xff, g7 >> 8, g7 & 0xff])
  }

  if ((g0 & 0xffc0) === 0xfe80) return true              // fe80::/10 link-local
  if ((g0 & 0xfe00) === 0xfc00) return true              // fc00::/7 benzersiz yerel
  if ((g0 & 0xff00) === 0xff00) return true              // ff00::/8 multicast
  return false
}

function adresGuvenli(host: string): boolean {
  const v4 = ipv4Ayristir(host)
  if (v4) return !ipv4Ozel(v4)
  if (host.includes(':')) return !ipv6Ozel(host)
  return true   // IP değil — ad; DNS aşamasında denetlenir
}

/**
 * URL'i doğrular. `izinliHostlar` verilirse YALNIZ o hostlara izin verilir
 * (en güçlü mod — talep ucu için önerilen).
 */
export async function ssrfGuvenliUrl(ham: string, izinliHostlar?: string[]): Promise<SsrfSonuc> {
  let u: URL
  try { u = new URL(ham) } catch { return { ok: false, sebep: 'gecersiz_url' } }

  if (!IZINLI_SEMALAR.has(u.protocol)) return { ok: false, sebep: 'sema_izinli_degil' }
  if (u.username || u.password) return { ok: false, sebep: 'url_kimlik_bilgisi' }
  if (!IZINLI_PORTLAR.has(u.port)) return { ok: false, sebep: 'port_izinli_degil' }

  const host = u.hostname.toLowerCase().replace(/\.$/, '')
  if (!host) return { ok: false, sebep: 'host_yok' }

  if (izinliHostlar && izinliHostlar.length > 0) {
    const uygun = izinliHostlar.some((h) => {
      const hh = h.toLowerCase().trim()
      return hh && (host === hh || host.endsWith('.' + hh))
    })
    if (!uygun) return { ok: false, sebep: 'host_izin_listesinde_degil' }
  }

  if (YASAK_ADLAR.includes(host)) return { ok: false, sebep: 'host_yasak' }
  if (YASAK_SONEKLER.some((s) => host.endsWith(s))) return { ok: false, sebep: 'host_yasak' }
  if (!adresGuvenli(host)) return { ok: false, sebep: 'ozel_ag_adresi' }

  // Ad ise DNS'i çözüp tüm kayıtları denetle (DNS rebinding savunması).
  const ipMi = ipv4Ayristir(host) !== null || host.includes(':')
  if (!ipMi) {
    const coz = dnsCozucu()
    if (!coz) return { ok: false, sebep: 'dns_cozucu_yok' }   // fail-closed
    const adresler: string[] = []
    for (const tip of ['A', 'AAAA'] as const) {
      try { adresler.push(...await coz(host, tip)) } catch { /* kayıt yok/desteklenmiyor */ }
    }
    if (adresler.length === 0) return { ok: false, sebep: 'dns_cozulemedi' }
    if (!adresler.every(adresGuvenli)) return { ok: false, sebep: 'ozel_ag_adresi' }
  }

  return { ok: true, url: u }
}

/**
 * Yönlendirmeleri elle izleyen fetch: her adım ssrfGuvenliUrl'den geçer.
 * `redirect: 'manual'` olmadan 302 ile iç ağa sıçranabilirdi.
 */
export async function fetchDogrulanmis(
  url: URL,
  izinliHostlar?: string[],
  maxAdim = 3,
): Promise<Response> {
  let hedef = url
  for (let i = 0; i <= maxAdim; i++) {
    const r = await fetch(hedef, { redirect: 'manual', headers: { accept: '*/*' } })
    if (r.status < 300 || r.status >= 400) return r

    const konum = r.headers.get('location')
    if (!konum) return r
    const sonraki = new URL(konum, hedef)
    const kontrol = await ssrfGuvenliUrl(sonraki.toString(), izinliHostlar)
    if (!kontrol.ok) throw new Error(`yonlendirme_reddedildi:${kontrol.sebep}`)
    hedef = kontrol.url
  }
  throw new Error('cok_fazla_yonlendirme')
}
