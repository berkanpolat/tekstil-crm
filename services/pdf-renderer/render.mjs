// Belge render çekirdeği. Orijinal studyo fonksiyonlarını (tkQuoteDoc, siparisDocHTML,
// soDoc, numuneHTML, stickerHTML) aynı sayfada çağırır → tasarım birebir.
// Not: durum değişkenlerinin bir kısmı `let` ile tanımlı (norder/sip/soS/order/numuneler);
// bunlar window'a düşmez, bu yüzden lexical bağlamaya window.eval ile atanır.
// Tek görünüm değişikliği: kod öneki STD- → TAS- (§2, harfli kod) — üretilen HTML'de ikame.
import { EN_PAIRS } from './i18n.mjs'

/** Belgeyi #print-root'a bas (durum + doc fonksiyonu + STD→TAS + EN + barkod). PDF/HTML ortak adımı. */
async function buildDoc(page, { template, data, language }) {
  await page.evaluate(({ template, data, language, enPairs }) => {
    const root = document.getElementById('print-root')
    root.innerHTML = ''
    const setVar = (name, val) => window.eval(name + ' = ' + JSON.stringify(val) + ';')
    const P = (o) => window.setPageOrient(o)

    if (template === 'fiyat_teklifi') {
      P('portrait')
      // language parametresi dil için OTORİTE — data.tkS.dil onu ezmesin.
      setVar('tkS', Object.assign({ opts: [] }, data.tkS, { dil: language === 'en' ? 'en' : 'tr' }))
      if (data.rates) setVar('tkRATES', data.rates)
      root.innerHTML = window.tkQuoteDoc()
    } else if (template === 'siparis_formu') {
      P('portrait')
      if (data.sip) setVar('sip', data.sip)
      root.innerHTML = window.siparisDocHTML()
    } else if (template === 'siparis_onay') {
      P('portrait')
      if (data.soS) setVar('soS', data.soS)
      root.innerHTML = window.soDoc()
    } else if (template === 'numune_etiketi') {
      P('portrait')
      const def = data.norder || {}
      const list = data.numuneler || []
      const pos = [['10mm', '19mm'], ['110mm', '19mm'], ['10mm', '158mm'], ['110mm', '158mm']]
      for (let i = 0; i < list.length; i += 4) {
        const sheet = document.createElement('div'); sheet.className = 'sheet'
        for (let j = 0; j < 4; j++) {
          const idx = i + j
          if (idx < list.length) {
            const it = list[idx]
            // D1: her etiket kendi müşteri/ürün kodunu taşır (çoklu müşteri tek çıktıda).
            setVar('norder', { musteri: it.musteri ?? def.musteri ?? '', urunkodu: it.urunkodu ?? def.urunkodu ?? '' })
            const slot = document.createElement('div'); slot.className = 'nslot'
            slot.style.left = pos[j][0]; slot.style.top = pos[j][1]
            slot.innerHTML = window.numuneHTML(it)
            sheet.appendChild(slot)
          }
        }
        root.appendChild(sheet)
      }
    } else if (template === 'koli_ustu') {
      P('portrait')
      setVar('order', data.order || {})
      const list = data.koliler || []
      for (let i = 0; i < list.length; i += 2) {
        const sheet = document.createElement('div'); sheet.className = 'sheet'
        ;[[i, '5mm'], [i + 1, '151mm']].forEach(([idx, top]) => {
          if (idx < list.length) {
            const slot = document.createElement('div'); slot.className = 'pslot'
            slot.style.left = '5mm'; slot.style.top = top
            slot.innerHTML = window.stickerHTML(list[idx], idx)
            sheet.appendChild(slot)
          }
        })
        root.appendChild(sheet)
      }
    } else if (template === 'maliyet_belgesi') {
      // P4B.7 — Maliyet belgesi (İÇ KULLANIM). studio.html'de fonksiyonu yok; HTML doğrudan kurulur.
      P('portrait')
      const m = data.maliyet || {}
      const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const rows = (m.items || []).map((it) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(it.name)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;color:#555">${esc(it.detail)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${esc(it.amount)}</td></tr>`).join('')
      const tiers = (m.tiers || []).map((t) => `<tr><td style="padding:5px 8px;border-bottom:1px solid #eee">${esc(t.qty)}</td><td style="padding:5px 8px;border-bottom:1px solid #eee">${esc(t.unitCost)}</td><td style="padding:5px 8px;border-bottom:1px solid #eee">%${esc(t.margin)}</td><td style="padding:5px 8px;border-bottom:1px solid #eee;font-weight:600">${esc(t.unitPrice)}</td><td style="padding:5px 8px;border-bottom:1px solid #eee">${esc(t.total)}</td></tr>`).join('')
      root.innerHTML = `<div class="sheet" style="width:210mm;min-height:297mm;box-sizing:border-box;padding:16mm;font-family:Inter,Arial,sans-serif;color:#1a2230;background:#fff">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1f2f57;padding-bottom:10px">
          <div><div style="font-size:22px;font-weight:700">MALİYET BELGESİ</div><div style="color:#777;font-size:12px">Ürün Maliyet Reçetesi ve Fiyat Kademeleri</div></div>
          <div style="background:#c0392b;color:#fff;padding:6px 12px;border-radius:6px;font-size:11px;font-weight:700;text-align:center">İÇ KULLANIM<br><span style="font-weight:400">Müşteri ile Paylaşılmaz</span></div>
        </div>
        <div style="display:flex;gap:16px;margin-top:16px">
          ${m.image ? `<img src="${m.image}" style="width:42mm;height:56mm;object-fit:cover;border:1px solid #ddd;border-radius:6px">` : ''}
          <div style="flex:1"><table style="width:100%;font-size:13px">
            <tr><td style="color:#888;padding:3px 0;width:120px">Ürün Kodu</td><td style="font-weight:600">${esc(m.code)}</td></tr>
            <tr><td style="color:#888;padding:3px 0">Ürün Adı</td><td style="font-weight:600">${esc(m.name)}</td></tr>
            <tr><td style="color:#888;padding:3px 0">Kategori</td><td>${esc(m.category)}</td></tr>
            <tr><td style="color:#888;padding:3px 0">Kompozisyon</td><td>${esc(m.composition)}</td></tr>
          </table></div>
        </div>
        <div style="margin-top:18px;font-weight:600;font-size:14px">Maliyet Reçetesi</div>
        <table style="width:100%;border-collapse:collapse;margin-top:6px;font-size:13px"><thead><tr style="background:#f4f6fa;color:#555;font-size:12px"><th style="padding:6px 8px;text-align:left">Kalem</th><th style="padding:6px 8px;text-align:left">Hesap</th><th style="padding:6px 8px;text-align:right">Tutar</th></tr></thead><tbody>${rows}</tbody></table>
        <div style="text-align:right;margin-top:8px;font-size:14px">Toplam Maliyet: <b>${esc(m.totalTry)}</b> &nbsp;≈&nbsp; <b>${esc(m.totalUsd)}</b></div>
        <div style="margin-top:6px;color:#888;font-size:11px">Kur: ${esc(m.rateSource)} · 1 USD = ${esc(m.usdRate)} ₺ · ${esc(m.rateDate)}</div>
        <div style="margin-top:18px;font-weight:600;font-size:14px">Fiyat Kademeleri</div>
        <table style="width:100%;border-collapse:collapse;margin-top:6px;font-size:13px"><thead><tr style="background:#f4f6fa;color:#555;font-size:12px"><th style="padding:5px 8px;text-align:left">Adet</th><th style="padding:5px 8px;text-align:left">Birim Maliyet</th><th style="padding:5px 8px;text-align:left">Marj</th><th style="padding:5px 8px;text-align:left">Birim Fiyat</th><th style="padding:5px 8px;text-align:left">Toplam</th></tr></thead><tbody>${tiers}</tbody></table>
        <div style="margin-top:28px;display:flex;justify-content:space-between;color:#888;font-size:11px;border-top:1px solid #eee;padding-top:8px">
          <div>Hazırlayan: ${esc(m.hazirlayan)}</div><div>Tarih: ${esc(m.tarih)}</div><div>Sürüm: ${esc(m.versiyon)}</div>
        </div>
      </div>`
    } else if (template === 'cari_ekstre') {
      // P5.7 — Cari hesap ekstresi. Self-contained HTML; maliyet_belgesi ile tutarlı tipografi.
      P('portrait')
      const e = data.ekstre || {}
      const en = language === 'en'
      const L = en
        ? { title: 'ACCOUNT STATEMENT', sub: 'Current Account Statement', company: 'Company', customer: 'Customer', taxNo: 'Tax No', period: 'Period', currency: 'Currency', date: 'Date', desc: 'Description', debit: 'Debit', credit: 'Credit', balance: 'Balance', opening: 'Opening balance', closing: 'Closing balance', generated: 'Generated', note: 'This statement is informational.' }
        : { title: 'CARİ HESAP EKSTRESİ', sub: 'Cari Hesap Dökümü', company: 'Firma', customer: 'Müşteri', taxNo: 'Vergi No', period: 'Dönem', currency: 'Para Birimi', date: 'Tarih', desc: 'Açıklama', debit: 'Borç', credit: 'Alacak', balance: 'Bakiye', opening: 'Dönem başı bakiye', closing: 'Dönem sonu bakiye', generated: 'Oluşturma', note: 'Bu ekstre bilgilendirme amaçlıdır.' }
      const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const co = e.company || {}, cu = e.customer || {}
      const rows = (e.rows || []).map((r) => `<tr>
        <td style="padding:5px 8px;border-bottom:1px solid #eee;white-space:nowrap">${esc(r.date)}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #eee">${esc(r.desc)}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:right;color:#c0392b">${esc(r.debit)}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:right;color:#1e8449">${esc(r.credit)}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${esc(r.balance)}</td></tr>`).join('')
      root.innerHTML = `<div class="sheet" style="width:210mm;min-height:297mm;box-sizing:border-box;padding:16mm;font-family:Inter,Arial,sans-serif;color:#1a2230;background:#fff">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1f2f57;padding-bottom:10px">
          <div><div style="font-size:22px;font-weight:700">${esc(co.name || 'Tekstil A.Ş.')}</div><div style="color:#777;font-size:12px">${esc([co.address, co.phone, co.email].filter(Boolean).join(' · '))}</div></div>
          <div style="text-align:right"><div style="font-size:16px;font-weight:700;color:#1f2f57">${L.title}</div><div style="color:#888;font-size:11px">${esc(L.sub)}</div></div>
        </div>
        <div style="display:flex;justify-content:space-between;gap:24px;margin-top:16px;font-size:13px">
          <div style="flex:1"><table style="width:100%">
            <tr><td style="color:#888;padding:2px 0;width:90px">${L.customer}</td><td style="font-weight:600">${esc(cu.name)}</td></tr>
            ${cu.taxNumber ? `<tr><td style="color:#888;padding:2px 0">${L.taxNo}</td><td>${esc(cu.taxNumber)}${cu.taxOffice ? ' · ' + esc(cu.taxOffice) : ''}</td></tr>` : ''}
            ${cu.address ? `<tr><td style="color:#888;padding:2px 0;vertical-align:top">${en ? 'Address' : 'Adres'}</td><td>${esc(cu.address)}</td></tr>` : ''}
          </table></div>
          <div style="text-align:right"><table style="width:100%">
            <tr><td style="color:#888;padding:2px 8px 2px 0">${L.period}</td><td style="font-weight:600">${esc(e.periodLabel)}</td></tr>
            <tr><td style="color:#888;padding:2px 8px 2px 0">${L.currency}</td><td style="font-weight:600">${esc(e.currency)}</td></tr>
          </table></div>
        </div>
        <div style="margin-top:14px;padding:8px 12px;background:#f4f6fa;border-radius:6px;font-size:13px;display:flex;justify-content:space-between">
          <span>${L.opening}</span><b>${esc(e.opening)}</b>
        </div>
        <table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:12.5px"><thead>
          <tr style="background:#1f2f57;color:#fff;font-size:12px"><th style="padding:7px 8px;text-align:left">${L.date}</th><th style="padding:7px 8px;text-align:left">${L.desc}</th><th style="padding:7px 8px;text-align:right">${L.debit}</th><th style="padding:7px 8px;text-align:right">${L.credit}</th><th style="padding:7px 8px;text-align:right">${L.balance}</th></tr>
        </thead><tbody>${rows || `<tr><td colspan="5" style="padding:16px;text-align:center;color:#999">${en ? 'No transactions in this period.' : 'Bu dönemde hareket yok.'}</td></tr>`}</tbody></table>
        <div style="margin-top:10px;padding:8px 12px;background:#eaf2ea;border-radius:6px;font-size:14px;display:flex;justify-content:space-between;font-weight:700">
          <span>${L.closing}</span><span>${esc(e.closing)}</span>
        </div>
        <div style="margin-top:28px;display:flex;justify-content:space-between;color:#888;font-size:11px;border-top:1px solid #eee;padding-top:8px">
          <div>${esc(L.note)}</div><div>${L.generated}: ${esc(e.generatedAt)}</div>
        </div>
      </div>`
    } else if (template === 'rapor') {
      // P7-C — Raporlar PDF. KPI/grafik/tablo gövdesi istemcide reportChartSvg ile
      // kurulur (ekranla birebir aynı SVG) ve data.rapor.bodyHtml olarak gelir;
      // antet/font/sayfa çerçevesi studio.html'deki window.reportDoc içindedir.
      P('portrait')
      root.innerHTML = window.reportDoc(data.rapor || {})
    } else {
      throw new Error('bilinmeyen şablon: ' + template)
    }

    // Kod öneki: STD- → TAS- (harfli). Barkod data-code'u da güncellenir.
    root.innerHTML = root.innerHTML.replace(/STD-/g, 'TAS-')
    // İngilizce: fiyat teklifi native (tkS.dil), diğer dördü HTML-üzeri ikameyle.
    if (language === 'en' && template !== 'fiyat_teklifi') {
      let h = root.innerHTML
      for (const [tr, en] of enPairs) h = h.split(tr).join(en)
      root.innerHTML = h
    }

    // Üretici bilgileri settings.company.* (Kabul 11): şablondaki gömülü değerleri ayarlarla ikame et.
    // İki geçiş (sentinel) — 'tekstilas.com'un 'info@tekstilas.com' içine sızmaması için.
    const U = data.uretici
    if (U) {
      const norm = (x) => (x == null ? '' : String(x))
      const vd = norm(U.tax_office) && !/v\.?\s*d\.?$/i.test(norm(U.tax_office).trim()) ? norm(U.tax_office).trim() + ' V.D.' : norm(U.tax_office)
      const pairs = [
        ['Küçükbakkalköy Mah. Dudullu Cd. Brandium Rezidans, İstanbul / Türkiye', norm(U.address)],
        ['info@tekstilas.com', norm(U.email)],
        ['Yenibosna V.D.', vd],
        ['0850 242 57 00', norm(U.phone)],
        ['tekstilas.com', norm(U.website)],
        ['612181028', norm(U.tax_number)],
        ['Tekstil A.Ş.', norm(U.name)],
      ].filter(([from, to]) => to && to !== from)
        .sort((a, b) => b[0].length - a[0].length) // uzun kaynak önce → alt-dize çakışması yok
      let h = root.innerHTML
      pairs.forEach(([from], i) => { h = h.split(from).join(' U' + i + ' ') })
      pairs.forEach(([, to], i) => { h = h.split(' U' + i + ' ').join(to) })
      root.innerHTML = h
    }
    // Sayfalanmış belgelerde (fiyat_teklifi/siparis_onay) son bir güvenlik: print-media
    // font farkından doğabilecek birkaç piksel taşmayı hafifçe küçültür (taban 0.9, kırpma yok).
    // Tüm innerHTML değişikliklerinden SONRA çalışır ki inline transform silinmesin.
    if (typeof window.qxFitSheet === 'function') {
      root.querySelectorAll('.qsheet, .so-sheet').forEach((s) => window.qxFitSheet(s))
    }
    if (typeof window.renderBarcodes === 'function') window.renderBarcodes(root)
    root.style.display = 'block'
  }, { template, data, language, enPairs: EN_PAIRS })
}

/** PDF üret (A4). */
export async function renderDocument(page, { template, data, language }) {
  await buildDoc(page, { template, data, language })
  await page.emulateMedia({ media: 'print' })
  return page.pdf({ printBackground: true, preferCSSPageSize: true, format: 'A4' })
}

/** Canlı önizleme için stilli, bağımsız HTML döndürür (barkodlar pre-render, script yok). */
export async function renderPreview(page, { template, data, language }) {
  await buildDoc(page, { template, data, language })
  return page.evaluate(() => {
    const styles = [...document.head.querySelectorAll('style')].map((s) => s.outerHTML).join('')
    const body = document.getElementById('print-root').innerHTML
    return '<!doctype html><html><head><meta charset="utf-8">' + styles +
      '</head><body style="margin:0;background:#fff"><div id="print-root" style="display:block">' + body + '</div></body></html>'
  })
}
