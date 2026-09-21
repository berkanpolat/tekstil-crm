// =====================================================================
// 2) EŞLE — kaynakları tek listeye bağlar, YAZMAZ.
//    node scripts/talep-geri-yukleme/esle.mjs
//    Çıktı: data/talep-geri-yukleme/birlesik.json + rapor.md
// =====================================================================
import { writeFileSync } from 'node:fs'
import { VERI, BASLANGIC, oku, jsonlOku, sha1 } from './ortak.mjs'
import {
  telNorm, payloadKur, kopyalariAyikla, eskiKodBul, surecTakipEsle,
  studioEksikleri, DURUM_YOL, kullaniciEposta, testMi,
} from './mantik.mjs'

const B_ham = jsonlOku('leads.jsonl').filter((r) => r.ts >= BASLANGIC)
const A = oku('audit_ops.json')
const C = oku('legacy_records.json')
const C_prof = Object.fromEntries(oku('legacy_profiles.json').map((p) => [p.id, p.full_name]))
const C_hist = oku('legacy_history.json')
const D = oku('studio_landing.json')

// B: kopyaları ayıkla, D'deki eksikleri ekle
const { tekil: B, kopya } = kopyalariAyikla(B_ham)
const D_ek = studioEksikleri(B, D)
const hepsi = [...B.map((r) => ({ ...r, kaynak_kayit: 'leads.jsonl' })), ...D_ek]
  .sort((x, y) => x.ts.localeCompare(y.ts))
const testler = hepsi.filter(testMi)
const liste = hepsi.filter((r) => !testMi(r))

// Süreç Takip: yalnız 1 Ağu+ ve müşteri telefonu olan kayıtlar aday
const C_aday = C.filter((r) => r.created_at >= BASLANGIC && telNorm(r.customers?.phone))
const kullanilan = new Set()
const histByRec = {}
for (const h of C_hist) (histByRec[h.record_id] ??= []).push(h)

const birlesik = liste.map((b) => {
  const payload = payloadKur(b, sha1)
  const eski = eskiKodBul(b, A, sha1)
  const st = surecTakipEsle(b, C_aday, kullanilan)
  return {
    ts: b.ts,
    kaynak_kayit: b.kaynak_kayit,
    payload,
    image: b.image ?? null,
    eski_kod: eski?.code ?? null,
    eski_id: eski?.id ?? null,
    surec_takip: st
      ? {
          id: st.id,
          durum: st.status,
          yol: DURUM_YOL[st.status] ?? { durumlar: [], asama: null },
          atanan_eposta: kullaniciEposta(C_prof[st.assignee_id]),
          not: st.note ?? null,
          tarih: st.date,
          updated_at: st.updated_at,
          gecmis: (histByRec[st.id] ?? [])
            .filter((h) => h.field_name === 'status')
            .sort((x, y) => x.changed_at.localeCompare(y.changed_at))
            .map((h) => ({ at: h.changed_at, from: h.old_value, to: h.new_value, by: kullaniciEposta(C_prof[h.changed_by]) })),
        }
      : null,
  }
})

writeFileSync(`${VERI}/birlesik.json`, JSON.stringify(birlesik, null, 1))

// ---- Rapor -----------------------------------------------------------
const n = (f) => birlesik.filter(f).length
const ay = (r) => r.ts.slice(0, 7)
const aylar = [...new Set(birlesik.map(ay))].sort()
const durumSay = {}
for (const r of birlesik) { const k = r.surec_takip?.durum ?? '(Süreç Takip\'te yok → Yeni)'; durumSay[k] = (durumSay[k] ?? 0) + 1 }
const kalanC = C_aday.filter((r) => !kullanilan.has(r.id))

const R = []
R.push(`# Talep geri yükleme — eşleştirme raporu (${new Date().toISOString().slice(0, 10)})`, '')
R.push(`Kapsam: ${BASLANGIC} sonrası siteden gelen talepler. **Hiçbir şey yazılmadı.**`, '')
R.push('## Sayılar', '')
R.push('| | |', '|---|---|')
R.push(`| B leads.jsonl ham | ${B_ham.length} |`)
R.push(`| B çift tıklama kopyası (atlandı) | ${kopya.length} |`)
R.push(`| D Studio'da olup B'de olmayan (eklendi) | ${D_ek.length} |`)
R.push(`| Test/deneme kaydı (atlandı, listesi altta) | ${testler.length} |`)
R.push(`| **CRM'e girecek talep** | **${birlesik.length}** |`)
R.push(`| — eski TAS kodu korunacak (A) | ${n((r) => r.eski_kod)} |`)
R.push(`| — Süreç Takip'te durumu var (C) | ${n((r) => r.surec_takip)} |`)
R.push(`| — hiç işlenmemiş → "Yeni" | ${n((r) => !r.surec_takip)} |`)
R.push(`| — görseli var | ${n((r) => r.image)} |`)
R.push(`| — sahibi atanacak | ${n((r) => r.surec_takip?.atanan_eposta)} |`)
R.push('', '## Aylara göre', '', '| Ay | Talep | Durumlu | Yeni |', '|---|---|---|---|')
for (const a of aylar) R.push(`| ${a} | ${n((r) => ay(r) === a)} | ${n((r) => ay(r) === a && r.surec_takip)} | ${n((r) => ay(r) === a && !r.surec_takip)} |`)
R.push('', '## Girecek durumlar (Süreç Takip → CRM durumu)', '', '| Süreç Takip durumu | Adet | CRM\'de görünecek |', '|---|---|---|')
const gorunum = (k) => { const y = DURUM_YOL[k]; if (!y) return 'Teklif · Teklif Bekliyor (Yeni)'; if (y.asama) return 'Teklif İletildi + İPTAL (Ticari Anlaşma Sağlanamadı)'; return y.durumlar.length ? y.durumlar.at(-1) : 'Teklif · Teklif Bekliyor' }
for (const [k, v] of Object.entries(durumSay).sort((x, y) => y[1] - x[1])) R.push(`| ${k} | ${v} | ${gorunum(k)} |`)
R.push('', '## Kapsam dışı kalanlar', '')
R.push(`Süreç Takip'te 1 Ağu+ olup siteden gelmemiş (WhatsApp/e-posta kökenli): **${kalanC.length}** kayıt. Berkan "Affan elle giriyor" dedi; girilmedi.`)
R.push('', '| Tarih | Müşteri | Durum | Giren |', '|---|---|---|---|')
for (const r of kalanC.slice(0, 60)) R.push(`| ${r.date} | ${r.customers?.name ?? ''} | ${r.status} | ${C_prof[r.created_by] ?? ''} |`)
if (kalanC.length > 60) R.push(`| … | ${kalanC.length - 60} kayıt daha | | |`)
R.push('', '## Test sayılıp atlananlar', '', '| ts | Ad | Not |', '|---|---|---|')
for (const t of testler) R.push(`| ${t.ts.slice(0, 16)} | ${t.name ?? ''} | ${(t.note ?? '').replace(/\n/g, ' ').slice(0, 60)} |`)
R.push('', '## Kopya sayılan B satırları', '', '| ts | Telefon (son 4) | Kopyası |', '|---|---|---|')
for (const k of kopya) R.push(`| ${k.ts} | …${telNorm(k.phone).slice(-4)} | ${k.kopyasi} |`)
R.push('', '## Yazma kuralları (yaz.mjs)', '')
R.push('- Her talep `intake-request` edge fonksiyonuna canlı yol ile gönderilir (müşteri eşleştirme, katalog kalemi, taslak teklif aynen).')
R.push('- `client_reference` lead.php kalıbında → tekrar çalıştırmak kopya üretmez.')
R.push('- Sonra SQL: `created_at`/`requested_at` = form zamanı; sahip, Süreç Takip notu ve durum geçmişi işlenir.')
R.push('- Durum: uygulamanın izinli geçişleri sırayla uygulanır (st_teklif_bekliyor → st_teklif_iletildi → …); reddedilenler op_set_stage ile "Teklif Reddedildi" aşamasına çekilir.')
R.push('- Eski TAS kodu: `operations_guard_code` tetikleyicisi kod değişimini yasaklar; aynı işlem içinde geçici kapatılıp geri açılır.')
R.push('- Aktarımın ürettiği bildirimler (yeni talep/atama) işlem sonunda silinir; ekip 471 bildirimle uyanmaz.')
R.push('- Görseller R2\'ye yüklenir, `files` satırı açılır.')
writeFileSync(`${VERI}/rapor.md`, R.join('\n'))
console.log(R.slice(0, 40).join('\n'))
console.log(`\n→ ${VERI}/rapor.md, ${VERI}/birlesik.json`)
