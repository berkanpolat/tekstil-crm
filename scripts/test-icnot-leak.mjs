// QA#10 — İÇ NOT SIZINTI TESTİ. İç notu dolu bir fiyat teklifi üret, PDF metnini çıkar,
// notun PDF'e GEÇMEDİĞİNİ doğrula. Sızıntı riski — testi olmadan tamamlanmış sayılmaz.
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SVC = process.env.PDF_SERVICE_URL ?? 'http://localhost:4046'
const MARK1 = 'ICNOTSIZINTIMARKERBIR'   // top-level internalNote
const MARK2 = 'ICNOTSIZINTIMARKERIKI'   // tkS içine sızmış olsa bile (savunma derinliği)
let fails = 0
const ok = (l, c) => { if (!c) fails++; console.log(`  ${c ? '✓' : '✗ HATA'} ${l}`) }

// Gerçek istemci akışını taklit: iç not verisi render'a GÖNDERİLMEZ (stripInternal).
// Ama en kötü durumu da test edelim: iç notu render'a ZORLA gönder → şablon yine sızdırmamalı.
const tkS = {
  talep: 'A7K2M9', musteri: 'ACME Tekstil', grup: 'Kadın Giyim', tur: 'Bluz',
  gecerli: '7 Gün', teslimat: '2026-08-15', odeme: '%50 Ön Ödeme', para: 'TRY', kdv: '10', indirim: '0',
  not: 'Müşteriye açık not', dil: 'tr',
  opts: [{ detay: 'Süprem bluz', kumas: '%100 pamuk', adet: '200', birim: '150', oner: true }],
}

async function renderPdf(data) {
  const res = await fetch(SVC.replace(/\/$/, '') + '/render', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ template: 'fiyat_teklifi', data, language: 'tr' }),
  })
  if (!res.ok) throw new Error('render ' + res.status)
  return Buffer.from(await res.arrayBuffer())
}
function pdfText(buf) {
  const dir = mkdtempSync(join(tmpdir(), 'icnot-'))
  const pdf = join(dir, 'q.pdf'); writeFileSync(pdf, buf)
  return execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' })
}

console.log('[1] En kötü durum — iç not render verisine ZORLA konsa bile PDF şablonu sızdırmıyor')
{
  const leaky = { tkS: { ...tkS, internalNote: MARK2 }, internalNote: MARK1 }
  const txt = pdfText(await renderPdf(leaky))
  ok('müşteri verisi PDF\'te var (render çalışıyor)', txt.includes('ACME Tekstil'))
  ok(`top-level iç not (${MARK1}) PDF\'te YOK`, !txt.includes(MARK1))
  ok(`tkS içindeki iç not (${MARK2}) PDF\'te YOK`, !txt.includes(MARK2))
}

console.log(`\n${fails === 0 ? '✓ İÇ NOT SIZMIYOR' : `✗ ${fails} SIZINTI/HATA`}`)
process.exit(fails === 0 ? 0 : 1)
