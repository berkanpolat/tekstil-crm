// =====================================================================
// 3) YAZ — birlesik.json'u CRM'e işler.
//    VARSAYILAN KURU KOŞU: yalnız okur, ne yapacağını söyler.
//    node scripts/talep-geri-yukleme/yaz.mjs                → kuru koşu
//    node scripts/talep-geri-yukleme/yaz.mjs --apply --limit=1  → ilk kaydı yaz (prova)
//    node scripts/talep-geri-yukleme/yaz.mjs --apply        → hepsi
//
// Yol: her talep canlı `intake-request` edge fonksiyonuna gönderilir (site ile
// AYNI yol: müşteri eşleştirme, katalog kalemi, taslak teklif, havuz dosyası).
// client_reference lead.php kalıbında → tekrar çalıştırmak kopya ÜRETMEZ.
// Ardından SQL ile: zaman damgaları, eski TAS kodu, aşama, sahip, Süreç Takip
// notu + durum geçmişi (event_log). Görseller R2'ye, `files` satırı açılır.
// =====================================================================
import { writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { CRM_REF, VERI, oku, sql, sbpToken, envDosyasi } from './ortak.mjs'

const APPLY = process.argv.includes('--apply')
const LIMIT = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? Infinity)
const TOK = sbpToken()
// Management API 'secrets' uç noktası değerlerin SHA-256 ÖZETİNİ döndürür (gerçek değeri değil);
// bu yüzden edge fn yerine aynı DB fonksiyonu (intake_process) SQL ile çağrılır ve
// dosya servisi kimliği .env.deploy'dan okunur.
const S = envDosyasi('.env.deploy')
if (!S.DOSYA_SERVIS_URL || !S.DOSYA_SERVIS_SIRRI) throw new Error('.env.deploy: DOSYA_SERVIS_URL / DOSYA_SERVIS_SIRRI eksik')
const q = (s) => sql(CRM_REF, s, TOK)
const lit = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`)

const hepsi = oku('birlesik.json')
const liste = hepsi.slice(0, LIMIT)
console.log(`${APPLY ? 'YAZMA (--apply)' : 'KURU KOŞU'} — ${liste.length}/${hepsi.length} talep`)

// ---- Ön kontrol: hangileri zaten CRM'de (idempotency) ---------------
const refs = liste.map((r) => r.payload.client_reference)
const varolan = new Map()
for (let i = 0; i < refs.length; i += 200) {
  const rows = await q(`select client_reference, id, code from operations where client_reference in (${refs.slice(i, i + 200).map(lit).join(',')})`)
  for (const r of rows) varolan.set(r.client_reference, r)
}
const kullanilanKodlar = new Set((await q(`select code from operations`)).map((r) => r.code))
console.log(`  zaten CRM'de: ${varolan.size} · yeni girecek: ${liste.length - varolan.size}`)
console.log(`  görsel (sunucudan doğrudan R2'ye): ${liste.filter((r) => r.image).length}`)
console.log(`  eski kod geri yazılacak: ${liste.filter((r) => r.eski_kod && !kullanilanKodlar.has(r.eski_kod)).length} (çakışan: ${liste.filter((r) => r.eski_kod && kullanilanKodlar.has(r.eski_kod) && !varolan.has(r.payload.client_reference)).length})`)
console.log(`  durum yolu yazılacak: ${liste.filter((r) => r.surec_takip && (r.surec_takip.yol.durumlar.length || r.surec_takip.yol.asama)).length} · sahip: ${liste.filter((r) => r.surec_takip?.atanan_eposta).length}`)
if (!APPLY) { console.log('\nKuru koşu bitti. Yazmak için --apply (ilk prova: --apply --limit=1).'); process.exit(0) }

// ---- 1) intake_process ile oluştur (site ile aynı DB yolu; 25'lik gruplar) ----
const BASLAMA = new Date().toISOString() // bildirim temizliği bu andan itibaren
const gunluk = []
const sonuc = { yeni: 0, tekrar: 0, hata: 0 }
const bekleyenler = liste.filter((r) => { if (varolan.has(r.payload.client_reference)) { r.op = varolan.get(r.payload.client_reference); sonuc.tekrar++; return false } return true })
async function isle(grup) {
  const rows = await q(`select v.ref, public.intake_process(v.p::jsonb) r from (values ${grup.map((r) => `(${lit(r.payload.client_reference)}, ${lit(JSON.stringify(r.payload))})`).join(',\n')}) v(ref, p)`)
  for (const x of rows) {
    const r = grup.find((g) => g.payload.client_reference === x.ref)
    gunluk.push({ ref: x.ref, ...x.r })
    if (!x.r?.ok) { sonuc.hata++; console.error(`  ! ${x.ref} → ${x.r?.error}`); continue }
    r.op = { id: x.r.operation_id, code: x.r.code }
    x.r.idempotent ? sonuc.tekrar++ : sonuc.yeni++
  }
}
for (let i = 0; i < bekleyenler.length; i += 25) {
  const grup = bekleyenler.slice(i, i + 25)
  try { await isle(grup) }
  catch (e) { // grup patladıysa tek tek: hatalı satır bulunur, diğerleri girer
    console.error(`  ! grup ${i / 25 + 1} hata, tek tek deneniyor: ${e.message.slice(0, 120)}`)
    for (const r of grup) { try { await isle([r]) } catch (e2) { sonuc.hata++; gunluk.push({ ref: r.payload.client_reference, hata: e2.message }); console.error(`  ! ${r.payload.client_reference}: ${e2.message.slice(0, 160)}`) } }
  }
}
writeFileSync(`${VERI}/yaz-gunluk-${Date.now()}.json`, JSON.stringify(gunluk, null, 1))
console.log(`  intake_process: yeni ${sonuc.yeni} · tekrar ${sonuc.tekrar} · hata ${sonuc.hata}`)

// ---- 2) SQL düzeltmeleri (50'lik gruplar) --------------------------------
const yazilacak = liste.filter((r) => r.op)
const hatalar = []
for (let i = 0; i < yazilacak.length; i += 50) {
  const grup = yazilacak.slice(i, i + 50)

  // 2a) zaman damgaları, sahip, Süreç Takip notu (kod ve durum AYRI — tetikleyiciler)
  const values = grup.map((r) => {
    const st = r.surec_takip
    const notlar = st?.not ? `[Süreç Takip · ${st.tarih}] ${st.not}` : null
    return `(${r.op.id}::bigint, ${lit(r.ts)}::timestamptz, ${lit(st?.atanan_eposta)}, ${lit(notlar)})`
  })
  await q(`
    with v(op_id, ts, eposta, ek_not) as (values ${values.join(',\n')})
    update operations o set
      created_at   = v.ts,
      requested_at = v.ts,
      sla_deadline = v.ts + (o.sla_deadline - o.created_at),
      owner_id     = coalesce((select id from users where email = v.eposta), o.owner_id),
      description  = case when v.ek_not is null or coalesce(o.description,'') like '%' || v.ek_not || '%'
                          then o.description else concat_ws(E'\\n\\n', o.description, v.ek_not) end,
      title        = case when o.title ~ '^Talep — \\d\\d\\.\\d\\d\\.\\d{4}$'
                          then 'Talep — ' || to_char(v.ts at time zone 'Europe/Istanbul', 'DD.MM.YYYY') else o.title end
    from v where o.id = v.op_id;
    with v(op_id, ts) as (values ${grup.map((r) => `(${r.op.id}::bigint, ${lit(r.ts)}::timestamptz)`).join(',')})
    update open_files f set due_at = v.ts + (f.due_at - f.opened_at), opened_at = v.ts, created_at = v.ts
    from v where f.operation_id = v.op_id and f.opened_at > v.ts;`)

  // 2b) eski TAS kodu — guard tetikleyicisi kod değişimini yasaklar; aynı işlemde geçici kapat
  const kodlar = grup.filter((r) => r.eski_kod && !kullanilanKodlar.has(r.eski_kod) && r.op.code !== r.eski_kod)
  if (kodlar.length) {
    kodlar.forEach((r) => kullanilanKodlar.add(r.eski_kod))
    await q(`
      begin;
      alter table operations disable trigger operations_guard_code;
      with v(op_id, kod) as (values ${kodlar.map((r) => `(${r.op.id}::bigint, ${lit(r.eski_kod)})`).join(',')})
      update operations o set code = v.kod from v where o.id = v.op_id and not exists (select 1 from operations x where x.code = v.kod);
      alter table operations enable trigger operations_guard_code;
      commit;`)
  }

  // 2c) durum yolu — uygulamanın izinli geçişleri sırayla; reddedilen → op_set_stage
  const yollu = grup.filter((r) => r.surec_takip && (r.surec_takip.yol.durumlar.length || r.surec_takip.yol.asama))
  if (yollu.length) {
    const satirlar = yollu.map((r) => `(${r.op.id}::bigint, ${lit(JSON.stringify(r.surec_takip.yol.durumlar))}::jsonb, ${lit(r.surec_takip.yol.asama)}, ${lit(r.surec_takip.updated_at ?? r.ts)}::timestamptz)`)
    const h = await q(`
      create temp table if not exists tgy_hata (op_id bigint, hata text) on commit drop;
      -- "Teklif reddedildi": 'teklif_reddedildi' aşaması PASİF ve kapanış durumuna geçiş kuralı yok;
      -- uygulamanın desteklediği yol İPTAL (sebep + not) → açık dosya da kapanır, listelerde kapalı görünür.
      create or replace function pg_temp.tgy_iptal(p_op bigint, p_at timestamptz) returns void language sql as $f$
        update operations set cancelled_at = p_at,
          cancellation_reason_id = (select id from cancellation_reasons where key = 'ticari_anlasma_saglanamadi'),
          cancellation_note = 'Süreç Takip: Teklif reddedildi'
        where id = p_op and cancelled_at is null
      $f$;
      do $$
      declare v record; k text; mevcut text;
      begin
        for v in select * from (values ${satirlar.join(',\n')}) t(op_id, durumlar, asama, kapanis) loop
          begin
            select ss.key into mevcut from operations o join stage_statuses ss on ss.id = o.status_id where o.id = v.op_id;
            -- yol zaten yürünmüşse (tekrar koşu) hiç dokunma
            if jsonb_array_length(v.durumlar) > 0 and mevcut = (v.durumlar ->> (jsonb_array_length(v.durumlar) - 1)) then
              if v.asama = 'teklif_reddedildi' then perform pg_temp.tgy_iptal(v.op_id, v.kapanis); end if;
              continue;
            end if;
            for k in select jsonb_array_elements_text(v.durumlar) loop
              -- zaten o durumdaysa/ötesindeyse atla (idempotent tekrar koşu)
              if mevcut = k then continue; end if;
              update operations set status_id = (select id from stage_statuses where key = k) where id = v.op_id;
              mevcut := k;
            end loop;
            if v.asama = 'teklif_reddedildi' then perform pg_temp.tgy_iptal(v.op_id, v.kapanis); end if;
          exception when others then
            insert into tgy_hata values (v.op_id, sqlerrm);
          end;
        end loop;
      end $$;
      select * from tgy_hata;`)
    for (const x of h) { hatalar.push(x); console.error(`  ! durum ${x.op_id}: ${x.hata}`) }
  }

  // 2d) Müşteri kuruluş zamanı: ilk talebin zamanı (bu turda açılanlar için)
  await q(`
    update customers c set created_at = m.ts from (
      select o.customer_id, min(o.requested_at) ts from operations o
      where o.id in (${grup.map((r) => r.op.id).join(',')}) group by o.customer_id) m
    where c.id = m.customer_id and c.created_at > m.ts;`)

  // 2e) Süreç Takip durum geçmişi → event_log (import_key ile idempotent)
  const olaylar = []
  for (const r of grup) for (const [k, hh] of (r.surec_takip?.gecmis ?? []).entries()) {
    olaylar.push(`('operation.stage_changed','operation',${lit(String(r.op.id))},(select id from users where email=${lit(hh.by)}),
      jsonb_build_object('to',${lit(hh.to)},'from',${lit(hh.from)},'src','surec-takip','import_key',${lit(`${r.surec_takip.id}:${k}`)}),
      ${lit(hh.at)}::timestamptz, ${lit(hh.at)}::timestamptz)`)
  }
  if (olaylar.length) await q(`
    insert into event_log (event_type, entity_type, entity_id, actor_id, payload, created_at, occurred_at)
    select * from (values ${olaylar.join(',\n')}) v(a,b,c,d,e,f,g)
    where not exists (select 1 from event_log e where e.payload->>'import_key' = v.e->>'import_key');`)
  console.log(`  SQL grup ${i / 50 + 1}: ${grup.length} talep · kod ${kodlar.length} · durum ${yollu.length} · geçmiş ${olaylar.length}`)
}

// 2f) Aktarımın ürettiği bildirimleri temizle (yeni talep / bilinen müşteri / atama)
if (yazilacak.length) {
  const sil = await q(`
    with s as (delete from notifications where entity_type='operation' and created_at >= ${lit(BASLAMA)}::timestamptz
      and entity_id in (${yazilacak.map((r) => lit(String(r.op.id))).join(',')}) returning 1)
    select count(*) n from s;`)
  console.log(`  bildirim temizlendi: ${sil[0]?.n ?? 0}`)
}
if (hatalar.length) writeFileSync(`${VERI}/yaz-durum-hatalari-${Date.now()}.json`, JSON.stringify(hatalar, null, 1))

// ---- 3) Görseller: sunucudan DOĞRUDAN R2'ye (tgy-aktar.php), sonra `files` satırı ----
// Sunucu betiği: scripts/talep-geri-yukleme/sunucu/tgy-aktar.php → public_html/tgy-aktar.php
// (token .secrets/tgy-aktar.env). Bilgisayara indirme yok. Idempotent: aynı sha256 varsa atlar.
const TGY = envDosyasi('.secrets/tgy-aktar.env').TGY_TOKEN
const SUNUCU = 'https://tekstilas.com/tgy-aktar.php'
const gorselli = yazilacak.filter((r) => r.image)
const mevcutSum = new Map()
for (let i = 0; i < gorselli.length; i += 200) {
  const rows = await q(`select entity_id, checksum from files where entity_type='operation' and deleted_at is null and entity_id in (${gorselli.slice(i, i + 200).map((r) => lit(String(r.op.id))).join(',')})`)
  for (const x of rows) mevcutSum.set(`${x.entity_id}:${x.checksum}`, true)
}
const ops = new Map(gorselli.map((r) => [r.op.id, r]))
const opDosya = gorselli.length ? await q(`select entity_id from files where entity_type='operation' and deleted_at is null and original_name in (${gorselli.map((r) => lit(r.image)).join(',')})`) : []
const zatenVar = new Set(opDosya.map((x) => Number(x.entity_id)))
const bekleyen = gorselli.filter((r) => !zatenVar.has(r.op.id))
let yuklenen = 0, hatali = 0
for (let i = 0; i < bekleyen.length; i += 15) {
  const grup = bekleyen.slice(i, i + 15).map((r) => ({ r, yol: `intake/${r.op.id}/${randomUUID()}-${r.image.replace(/[^A-Za-z0-9._-]/g, '_')}`.slice(0, 200) }))
  const res = await fetch(SUNUCU, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: TGY, servis_url: S.DOSYA_SERVIS_URL, servis_sirri: S.DOSYA_SERVIS_SIRRI, dosyalar: grup.map((g) => ({ ad: g.r.image, yol: g.yol })) }) })
  const j = await res.json().catch(() => null)
  if (!res.ok || !j?.ok) { console.error(`  ! sunucu ${res.status}`); hatali += grup.length; continue }
  const satirlar = []
  for (const [k, s] of j.sonuc.entries()) {
    const g = grup[k]
    if (!s.ok) { hatali++; console.error(`  ! ${s.ad}: ${s.hata ?? s.http}`); continue }
    if (mevcutSum.has(`${g.r.op.id}:${s.sha256}`)) continue
    satirlar.push(`('r2', ${lit(g.yol)}, ${lit(s.ad)}, ${lit(s.mime)}, ${s.size}, ${lit(s.sha256)}, ${lit(s.mime.startsWith('image/') ? 'image' : 'document')}, 'operation', ${lit(String(g.r.op.id))}, ${lit(g.r.ts)}::timestamptz)`)
  }
  if (satirlar.length) await q(`insert into files (bucket, storage_path, original_name, mime_type, size_bytes, checksum, category, entity_type, entity_id, created_at) values ${satirlar.join(',\n')}`)
  yuklenen += satirlar.length
  console.log(`  görsel grup ${i / 15 + 1}: ${satirlar.length} yüklendi`)
}
console.log(`  görsel: yüklendi ${yuklenen} · zaten vardı ${zatenVar.size} · hatalı ${hatali}`)

// ---- 4) Özet ----------------------------------------------------------
const ozet = await q(`select date_trunc('month',requested_at)::date ay, s.key asama, ss.key durum, count(*) from operations o
  join operation_stages s on s.id=o.stage_id left join stage_statuses ss on ss.id=o.status_id
  where o.source='web_sitesi' and o.deleted_at is null group by 1,2,3 order by 1,4 desc`)
console.table(ozet)
