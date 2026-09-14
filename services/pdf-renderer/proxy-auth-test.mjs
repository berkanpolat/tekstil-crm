// v1.45.0 doğrulama: PDF servisi x-pdf-secret ile korumalı; proxy'nin (generate-document)
// yaptığı tek şey bu başlığı EKLEMEK. Bu betik servisi PDF_SECRET ile ayağa kaldırır ve:
//  • başlıkla /preview + /render (fiyat_teklifi, rapor, maliyet_belgesi, cari_ekstre) çalışır,
//  • başlıksız / yanlış secret → 401,
// olduğunu uçtan uca doğrular. DB'ye YAZMAZ (yalnız yerel render servisi).
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = 4099
const SECRET = 'yerel-test-secret'
const BASE = `http://127.0.0.1:${PORT}`

const srv = spawn('node', [join(__dirname, 'server.mjs')], {
  env: { ...process.env, PORT: String(PORT), PDF_SECRET: SECRET, PDF_CORS_ORIGIN: '*' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
srv.stdout.on('data', () => {})
srv.stderr.on('data', (d) => process.stderr.write(`[srv] ${d}`))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitHealth(n = 60) {
  for (let i = 0; i < n; i++) {
    try { const r = await fetch(`${BASE}/health`); if (r.ok) return true } catch { /* not up */ }
    await sleep(500)
  }
  return false
}

let ok = true
const check = (label, cond, extra = '') => { console.log(`${cond ? '✓' : '✗'} ${label}${extra ? ' — ' + extra : ''}`); if (!cond) ok = false }

async function post(path, body, headers = {}) {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
  return r
}
const auth = { 'x-pdf-secret': SECRET }

// Örnek gövdeler (proxy bunları aynen iletir; edge fn yalnız x-pdf-secret ekler).
const tier = (a, m, c) => ({ adet: a, marj: m, birim: (c * (1 + m / 100)).toFixed(2), tutar: (c * (1 + m / 100) * a).toFixed(2), oner: a === 200 })
const teklif = { template: 'fiyat_teklifi', language: 'tr', data: { tkS: { talep: '', musteri: 'Polat Çetiner', grup: 'Kadın', tur: 'Gömlek', para: 'USD', kdv: '10', indirim: '0', gecerli: '7 Gün', odeme: 'x',
  urunler: [{ urun: 'Gömlek', kod: 'G1', kumas: 'Keten', maliyetEksik: false, kademeler: [tier(50, 40, 9), tier(200, 30, 9), tier(500, 25, 9)] }] }, rates: { USD: 41.5, status: 'ok' } } }
const rapor = { template: 'rapor', language: 'tr', data: { rapor: { title: 'Test Rapor', bodyHtml: '<div class="qsheet"><div class="qfit"><h1>Rapor</h1><p>Gövde</p></div></div>' } } }
const maliyet = { template: 'maliyet_belgesi', language: 'tr', data: { maliyet: { code: 'X', name: 'Ürün', category: 'K', composition: 'Pamuk', items: [{ name: 'Kumaş', detail: '1 m', amount: '10' }], totalTry: '100', totalUsd: '3', tiers: [{ qty: 50, unitCost: '2', margin: 40, unitPrice: '2.8', total: '140' }], hazirlayan: '-', tarih: '2026-09-14', versiyon: 1 } } }
const ekstre = { template: 'cari_ekstre', language: 'tr', data: { ekstre: { company: { name: 'Firma' }, customer: { name: 'Müşteri' }, periodLabel: 'x', currency: 'TRY', opening: '0', closing: '0', rows: [], generatedAt: '2026-09-14' } } }

const pdfMagic = (buf) => Buffer.from(buf).subarray(0, 5).toString('latin1') === '%PDF-'

try {
  if (!(await waitHealth())) { console.error('servis /health vermedi'); srv.kill('SIGKILL'); process.exit(1) }

  // 1) Kimlik: başlıksız + yanlış secret → 401
  check('başlıksız /render → 401', (await post('/render', teklif)).status === 401)
  check('yanlış secret /render → 401', (await post('/render', teklif, { 'x-pdf-secret': 'yanlis' })).status === 401)
  check('başlıksız /preview → 401', (await post('/preview', teklif)).status === 401)

  // 2) Doğru secret ile önizleme (HTML) + tüm belge tiplerinde render (PDF)
  const pv = await post('/preview', teklif, auth)
  const pvHtml = await pv.text()
  check('preview (fiyat_teklifi) → 200 HTML', pv.ok && pvHtml.includes('qsheet'))

  for (const [ad, body] of [['fiyat_teklifi', teklif], ['rapor', rapor], ['maliyet_belgesi', maliyet], ['cari_ekstre', ekstre]]) {
    const r = await post('/render', body, auth)
    const buf = await r.arrayBuffer()
    check(`render (${ad}) → 200 PDF`, r.ok && pdfMagic(buf), `${r.status}, ${buf.byteLength} bayt`)
  }
} catch (e) {
  console.error('HATA:', e); ok = false
} finally {
  srv.kill('SIGKILL')
}
console.log(ok ? '\nPROXY-PIPELINE DOĞRULANDI (başlık eklenince tüm belgeler üretiliyor)' : '\nBAŞARISIZ')
process.exit(ok ? 0 : 1)
