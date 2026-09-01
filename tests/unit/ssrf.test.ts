import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ssrfGuvenliUrl } from '../../supabase/functions/_shared/ssrf.ts'

// SAST 1 Eyl 2026 — Kritik SSRF regresyon testi.
//
// intake-request'te `file_url` yalnız .trim() görüp doğrudan fetch ediliyordu.
// Yanıt Storage'a yazıldığı için KÖR DEĞİL, okunabilir SSRF'ti: Edge Runtime'dan
// bulut metadata servisine (169.254.169.254) ve iç servislere erişilip içerik
// geri okunabiliyordu. Bu test o kapının bir daha açılmamasını sağlar.

// ssrf.ts ad çözümlemesi için Deno.resolveDns kullanır; Node/vitest altında
// deterministik bir sahte ile değiştiriyoruz.
// NOT: buradaki adresler gerçekten yönlendirilebilir aralıkta olmalı — 203.0.113.0/24
// gibi belgeleme blokları guard tarafından (doğru biçimde) reddedilir.
const DNS: Record<string, string[]> = {
  'tekstilas.com': ['93.184.216.34'],
  'www.tekstilas.com': ['93.184.216.34'],
  'evil.example': ['169.254.169.254'],          // DNS rebinding: ad masum, adres metadata
  'iyi.example': ['93.184.216.34'],
}

beforeAll(() => {
  ;(globalThis as unknown as { Deno?: unknown }).Deno = {
    resolveDns: (host: string, tip: string) => {
      if (tip !== 'A') return Promise.reject(new Error('kayit yok'))
      const a = DNS[host]
      return a ? Promise.resolve(a) : Promise.reject(new Error('NXDOMAIN'))
    },
  }
})
afterAll(() => { delete (globalThis as unknown as { Deno?: unknown }).Deno })

describe('ssrfGuvenliUrl — iç ağ ve metadata engeli', () => {
  const reddedilmeli: [string, string][] = [
    ['http://169.254.169.254/latest/meta-data/', 'AWS/bulut metadata (asıl hedef)'],
    ['http://[::ffff:169.254.169.254]/', 'IPv4-eşlenmiş IPv6 ile metadata'],
    ['http://127.0.0.1:8000/', 'loopback'],
    ['http://localhost/admin', 'localhost adı'],
    ['http://10.0.0.5/', 'özel ağ 10/8'],
    ['http://172.16.3.4/', 'özel ağ 172.16/12'],
    ['http://192.168.1.1/', 'özel ağ 192.168/16'],
    ['http://100.64.0.1/', 'CGNAT'],
    ['http://[::1]/', 'IPv6 loopback'],
    ['http://[fd00::1]/', 'IPv6 benzersiz yerel'],
    ['http://metadata.google.internal/', 'GCP metadata adı'],
    ['http://sunucu.internal/x', '.internal soneki'],
    ['file:///etc/passwd', 'dosya şeması'],
    ['gopher://127.0.0.1:6379/_INFO', 'gopher şeması'],
    ['http://kullanici:sifre@ornek.com/', 'URL içinde kimlik bilgisi'],
    ['http://ornek.com:22/', 'izinli olmayan port (SSH)'],
    ['http://evil.example/', 'DNS rebinding — ad masum, A kaydı metadata'],
  ]

  for (const [url, aciklama] of reddedilmeli) {
    it(`reddeder: ${aciklama}`, async () => {
      const r = await ssrfGuvenliUrl(url)
      expect(r.ok, `${url} kabul edildi — SSRF açık!`).toBe(false)
    })
  }

  it('çözülemeyen adı reddeder (fail-closed)', async () => {
    const r = await ssrfGuvenliUrl('https://olmayan-alan-adi.example/')
    expect(r.ok).toBe(false)
  })

  it('meşru dış adresi kabul eder', async () => {
    const r = await ssrfGuvenliUrl('https://iyi.example/dosya.pdf')
    expect(r.ok).toBe(true)
  })
})

describe('ssrfGuvenliUrl — izin listesi (sıkı mod)', () => {
  const izin = ['tekstilas.com']

  it('izinli hostu kabul eder', async () => {
    const r = await ssrfGuvenliUrl('https://tekstilas.com/leads_private/uploads/a.jpg', izin)
    expect(r.ok).toBe(true)
  })

  it('alt alan adını kabul eder', async () => {
    const r = await ssrfGuvenliUrl('https://www.tekstilas.com/a.jpg', izin)
    expect(r.ok).toBe(true)
  })

  it('listede olmayan hostu reddeder', async () => {
    const r = await ssrfGuvenliUrl('https://iyi.example/a.jpg', izin)
    expect(r.ok).toBe(false)
  })

  it('benzer görünen hostu reddeder (sonek yanılgısı)', async () => {
    const r = await ssrfGuvenliUrl('https://tekstilas.com.saldirgan.example/a.jpg', izin)
    expect(r.ok).toBe(false)
  })
})
