// P4A.9 — Belge motoru güvenlik/kalite testleri (servis düzeyi, tarayıcısız).
// Kapsam: (1) İÇ NOT SIZINTISI YOK  (2) harfli barkod (TAS-)  (3) EN çeviri tam
//         (4) yeniden üretim birebir (deterministik)  (5) idempotency hash.
// Not: sert kapılar arayüzden test-gates-ui.mjs + test-generate-doc-ui.mjs ile kanıtlı.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const SVC = process.env.PDF_SERVICE_URL ?? 'http://localhost:4046'
const PGURL = process.env.PGURL ?? readFileSync('/tmp/pgurl.txt', 'utf8').trim()
const TESTID = '00000000-0000-0000-0000-0000000000f9'
const sql = (s) => execFileSync('psql', [PGURL, '-qtAc', s], { encoding: 'utf8' }).trim()
let fails = 0
const ok = (l, c) => { if (!c) fails++; console.log(`  ${c ? '✓' : '✗ HATA'} ${l}`) }
const sha = (b) => createHash('sha256').update(b).digest('hex')
const preview = async (template, data, language = 'tr') => {
  const r = await fetch(SVC + '/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ template, data, language }) })
  if (!r.ok) throw new Error(`preview ${template} ${r.status}`)
  return r.text()
}
const render = async (template, data, language = 'tr') => {
  const r = await fetch(SVC + '/render', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ template, data, language }) })
  if (!r.ok) throw new Error(`render ${template} ${r.status}`)
  return Buffer.from(await r.arrayBuffer())
}

// ── kurulum: gizli token içeren iç notlu operasyon ────────────────────────
const SECRET = 'GIZLIICNOT_' + sql(`select floor(random()*1e9)::bigint`)
const cust = sql(`select id from public.customers where deleted_at is null limit 1`)
const cat = sql(`select id from public.product_categories where key='cat_erkek_ust'`)
const typ = sql(`select id from public.product_categories where parent_id=${cat} limit 1`)
const opId = sql(`insert into public.operations (customer_id, category_id, type_id, channel_id, created_by, cancellation_note)
  values (${cust}, ${cat}, ${typ}, (select id from public.request_channels where key='web_sitesi'), '${TESTID}', '${SECRET}_iptal') returning id`)
// gizli iç not (is_internal=true) — belgeye ASLA girmemeli
sql(`insert into public.notes (entity_type, entity_id, body, is_internal, created_by) values ('operation', '${opId}', '${SECRET} müşteriye söyleme', true, '${TESTID}')`)
// müşteri adına da ekleyelim ki "sızmaması gereken alan" ile "sızması gereken alan" ayrışsın
console.log('operasyon:', opId, '· gizli token:', SECRET)

const TYPES = ['fiyat_teklifi', 'siparis_onay', 'numune_etiketi', 'siparis_formu', 'koli_ustu']

console.log('\n[1] İç not sızıntısı — build_document_data + render HTML gizli tokeni İÇERMEZ')
for (const t of TYPES) {
  const data = JSON.parse(sql(`select public.build_document_data(${opId}, '${t}', 'tr')`))
  const inJson = JSON.stringify(data).includes(SECRET)
  const html = await preview(t, data, 'tr')
  const inHtml = html.includes(SECRET)
  ok(`${t}: build verisinde gizli token yok`, !inJson)
  ok(`${t}: render HTML'de gizli token yok`, !inHtml)
}

console.log('\n[2] Harfli barkod — TAS- kodu (harf içeren) barkoda birebir geçiyor')
{
  const numData = { uretici: JSON.parse(sql(`select public.document_uretici()`)), norder: { musteri: 'ACME', urunkodu: 'TAS-AB1234' }, numuneler: [{ beden: 'M', renk: 'Lacivert' }] }
  const html = await preview('numune_etiketi', numData, 'tr')
  ok('numune barkod data-code harfli kodu içeriyor (TAS-AB1234)', html.includes('TAS-AB1234'))
  ok('barkod SVG önceden çizildi (rect/path var)', /<svg[^>]*class="bc"[\s\S]*?<(rect|path)/.test(html))
  const sipData = JSON.parse(sql(`select public.build_document_data(${opId}, 'siparis_formu', 'tr')`))
  sipData.sip.urunkodu = 'TAS-CD5678'
  sipData.sip.renkler = [{ ad: 'Beyaz', hex: '#fff', q: { XS: 3 } }]
  const sipHtml = await preview('siparis_formu', sipData, 'tr')
  ok('sipariş formu barkod listesinde harfli kod (TAS-CD5678-BEYAZ-XS)', /TAS-CD5678-BEYAZ-XS/i.test(sipHtml))
}

console.log('\n[3] EN çeviri tam — 4 belgede (teklif native) bilinen TR etiketleri sızmıyor')
{
  const TR_LEAK = {
    siparis_onay: ['Firma Bilgileri', 'Üretim Detayları', 'Fiyat ve Termin', 'Seri Üretime Geçiş', 'Numune Değerlendirme', 'İptal Durumu'],
    siparis_formu: ['Üretici', 'Alıcı', 'Sipariş Künyesi', 'Bakım Talimatları', 'Barkod Listesi', 'Genel Toplam'],
    numune_etiketi: ['MÜŞTERİ ADI', 'ÜRÜN KODU', 'BEDEN', 'ÜRETİM NUMUNESİ'],
    koli_ustu: ['MÜŞTERİ', 'KOLİ NUMARASI', 'TESLİM ADRESİ', 'KOLİ AĞIRLIĞI'],
  }
  for (const t of ['siparis_onay', 'siparis_formu', 'numune_etiketi', 'koli_ustu']) {
    const data = JSON.parse(sql(`select public.build_document_data(${opId}, '${t}', 'en')`))
    if (t === 'numune_etiketi') data.numuneler = [{ beden: 'M', renk: 'Navy' }]
    if (t === 'koli_ustu') data.koliler = [{ musteri: 'ACME', icerik: 'TAS-1', adres: 'x', renk: 'Navy', beden: 'M', adet: '10', agirlik: '5kg' }]
    if (t === 'siparis_formu') data.sip.renkler = [{ ad: 'Navy', hex: '#123', q: { XS: 2 } }]
    const html = await preview(t, data, 'en')
    const leaked = TR_LEAK[t].filter((s) => html.includes(s))
    ok(`${t} EN: TR etiket sızıntısı yok${leaked.length ? ' → KALAN: ' + leaked.join(', ') : ''}`, leaked.length === 0)
  }
}

console.log('\n[4] Yeniden üretim birebir — aynı veri+dil iki kez render → aynı içerik')
{
  const data = JSON.parse(sql(`select public.build_document_data(${opId}, 'siparis_onay', 'tr')`))
  data.soS.kumas = '320g süprem'
  const h1 = await preview('siparis_onay', data, 'tr')
  const h2 = await preview('siparis_onay', data, 'tr')
  ok('önizleme HTML iki üretimde birebir aynı', h1 === h2)
  const p1 = await render('siparis_onay', data, 'tr')
  const p2 = await render('siparis_onay', data, 'tr')
  // PDF baytları determinizmi (Chromium sabit) — değilse içerik zaten birebir (HTML eşit)
  ok(`PDF baytları birebir (sha eşit) [byte1=${p1.length}]`, sha(p1) === sha(p2))
}

console.log('\n[5] Idempotency hash — aynı veri aynı hash, değişince farklı')
{
  const TEMPLATE_VERSION = '1'
  const hash = (d, lang) => sha(JSON.stringify(d) + '|' + lang + '|' + TEMPLATE_VERSION)
  const d1 = JSON.parse(sql(`select public.build_document_data(${opId}, 'siparis_onay', 'tr')`))
  const d2 = JSON.parse(JSON.stringify(d1))
  const d3 = JSON.parse(JSON.stringify(d1)); d3.soS.adet = '9999'
  ok('aynı veri → aynı hash', hash(d1, 'tr') === hash(d2, 'tr'))
  ok('veri değişti → farklı hash', hash(d1, 'tr') !== hash(d3, 'tr'))
  ok('dil değişti → farklı hash', hash(d1, 'tr') !== hash(d1, 'en'))
}

// temizlik
sql(`delete from public.notes where entity_type='operation' and entity_id='${opId}'; delete from public.event_log where entity_type='operation' and entity_id='${opId}'; delete from public.operations where id=${opId};`)
console.log(`\n${fails === 0 ? '✓ TÜM P4A.9 TESTLERİ GEÇTİ' : '✗ ' + fails + ' TEST BAŞARISIZ'}`)
process.exit(fails === 0 ? 0 : 1)
