// B.10 — Bildirim sistemi DB regresyon testi (B.1 açık dosya + B.2 motor + B.3 erteleme + B.8).
// Trigger'lar, kademe geçişleri, erteleme, sahipsiz dağıtım, süreç bildirimleri.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const PGURL = process.env.PGURL ?? readFileSync('/tmp/pgurl.txt', 'utf8').trim()
const F9 = '00000000-0000-0000-0000-0000000000f9'
const sql = (s) => execFileSync('psql', [PGURL, '-qtAc', s], { encoding: 'utf8' }).trim()
let fails = 0
const ok = (l, c) => { if (!c) fails++; console.log(`  ${c ? '✓' : '✗ HATA'} ${l}`) }

const cust = sql(`select id from public.customers where deleted_at is null limit 1`)
const cat = sql(`select id from public.product_categories where parent_id is null and is_active limit 1`)
const typ = sql(`select id from public.product_categories where parent_id is not null and is_active limit 1`)
const chan = sql(`select id from public.request_channels where key='web_sitesi'`)
const newOp = (owner) => sql(`insert into public.operations (customer_id, category_id, type_id, channel_id, created_by, owner_id)
  values (${cust},${cat},${typ},${chan},'${F9}',${owner ? `'${owner}'` : 'null'}) returning id`)
const cleanup = (op) => sql(`delete from public.notifications where entity_id='${op}'; delete from public.open_file_snoozes where open_file_id in (select id from public.open_files where operation_id=${op}); delete from public.open_files where operation_id=${op}; update public.operations set cancelled_at=now(), cancellation_note='t' where id=${op}; delete from public.open_files where operation_id=${op}; delete from public.event_log where entity_type='operation' and entity_id='${op}'; delete from public.quotes where operation_id=${op}; delete from public.operations where id=${op}`)

console.log('[B.1] Açık dosya yaşam döngüsü')
{
  const op = newOp(F9)
  ok('talep → teklif_bekleniyor açıldı (due=talep+24s)', sql(`select (file_type='teklif_bekleniyor' and due_at-opened_at=interval '24 hour')::text from public.open_files where operation_id=${op} and closed_at is null`) === 'true')
  const fid = sql(`insert into public.files (bucket,storage_path,original_name,mime_type,category,entity_type,entity_id,uploaded_by) values ('documents','t/b-${op}.pdf','b.pdf','application/pdf','document','operation','${op}','${F9}') returning id`)
  const q = sql(`insert into public.quotes (operation_id, quote_file_id) values (${op},${fid}) returning id`)
  ok('teklif üretildi → teklif kapandı + sonuc_bekleniyor açıldı', sql(`select string_agg(file_type,',' order by id) from public.open_files where operation_id=${op} and closed_at is null`) === 'sonuc_bekleniyor')
  sql(`update public.quotes set status_id=(select id from public.quote_statuses where key='olumlu_beklemede'), follow_up_at=now()+interval '5 days' where id=${q}`)
  ok('olumlu_beklemede → sonuc kapandı + olumlu_beklemede açıldı', sql(`select file_type from public.open_files where operation_id=${op} and closed_at is null`) === 'olumlu_beklemede')
  sql(`update public.operations set cancelled_at=now(), cancellation_note='t' where id=${op}`)
  ok('operasyon iptal → tüm açık dosyalar kapandı', sql(`select count(*) from public.open_files where operation_id=${op} and closed_at is null`) === '0')
  sql(`delete from public.files where entity_type='operation' and entity_id='${op}'`); cleanup(op)
}

console.log('[B.2] Kademe motoru')
{
  const op = newOp(F9)
  const of = sql(`select id from public.open_files where operation_id=${op}`)
  sql(`update public.open_files set opened_at=now()-interval '13 hour', due_at=now()+interval '11 hour', last_level=0 where id=${of}`)
  sql(`select public.process_open_file_alerts()`)
  ok('L1 (%54) → sorumlu (f9) info bildirim', sql(`select count(*) from public.notifications where user_id='${F9}' and entity_id='${op}' and severity='info'`) === '1')
  sql(`select public.process_open_file_alerts()`)
  ok('dedup → hâlâ 1 bildirim (her kademe bir kez)', sql(`select count(*) from public.notifications where user_id='${F9}' and entity_id='${op}'`) === '1')
  sql(`update public.open_files set due_at=now()-interval '1 hour' where id=${of}`); sql(`select public.process_open_file_alerts()`)
  ok('L3 (süre doldu) → kritik bildirim', sql(`select count(*) from public.notifications where entity_id='${op}' and severity='critical'`) >= '1')
  sql(`update public.open_files set due_at=now()-interval '49 hour' where id=${of}`); sql(`select public.process_open_file_alerts()`)
  ok('L4 (yükseltme) → owner+admin escalated', sql(`select count(*) from public.notifications where entity_id='${op}' and type='open_file_escalated'`) === sql(`select count(*) from public.users u join public.roles r on r.id=u.role_id where r.key in ('owner','admin') and u.is_active`))
  cleanup(op)
}

console.log('[B.2] Havuz + üstlenme')
{
  const op = newOp(null) // sahipsiz
  const of = sql(`select id from public.open_files where operation_id=${op}`)
  sql(`update public.open_files set opened_at=now()-interval '13 hour', due_at=now()+interval '11 hour', last_level=0, assigned_to=null where id=${of}`)
  sql(`select public.process_open_file_alerts()`)
  const opsRole = sql(`select count(*) from public.users u join public.roles r on r.id=u.role_id where r.key='operations' and u.is_active`)
  ok('sahipsiz → havuz (operations) alıcılarına', sql(`select count(*) from public.notifications where entity_id='${op}'`) === opsRole)
  sql(`update public.operations set owner_id='${F9}' where id=${op}`)
  ok('üstlenince diğerlerinin bildirimi kapandı', sql(`select count(*) from public.notifications where entity_id='${op}' and dismissed_at is null and user_id<>'${F9}'`) === '0')
  cleanup(op)
}

console.log('[B.3] Erteleme')
{
  const op = newOp(F9)
  const of = sql(`select id from public.open_files where operation_id=${op}`)
  sql(`update public.open_files set due_at=now()-interval '1 hour', last_level=0 where id=${of}`); sql(`select public.process_open_file_alerts()`)
  let err = ''
  try { sql(`select public.snooze_open_file(${of}, '  ', now()+interval '2 hour')`) } catch (e) { err = 'reddedildi' }
  ok('sebepsiz erteleme reddedildi', err === 'reddedildi')
  sql(`select public.snooze_open_file(${of}, 'sebep', now()+interval '2 hour')`)
  sql(`delete from public.notifications where entity_id='${op}'`); sql(`select public.process_open_file_alerts()`)
  ok('erteli iken motor → yeni bildirim yok', sql(`select count(*) from public.notifications where entity_id='${op}'`) === '0')
  sql(`update public.open_files set snooze_until=now()-interval '1 minute' where id=${of}`); sql(`select public.process_open_file_alerts()`)
  ok('erteleme bitince → yeniden hatırlatma + snooze temizlendi', sql(`select (count(*)>=1)::text from public.notifications where entity_id='${op}'`) === 'true' && sql(`select (snooze_until is null)::text from public.open_files where id=${of}`) === 'true')
  sql(`select public.snooze_open_file(${of},'a',now()+interval '1 hour')`); sql(`select public.snooze_open_file(${of},'b',now()+interval '1 hour')`)
  sql(`delete from public.notifications where type='open_file_snooze_exceeded' and entity_id='${op}'`)
  ok('azami aşımı (4>3) → yönetici bildirimi', (sql(`select public.snooze_open_file(${of},'c',now()+interval '1 hour')`).includes('true')) && sql(`select count(*) from public.notifications where type='open_file_snooze_exceeded' and entity_id='${op}'`) >= '1')
  cleanup(op)
}

console.log('[B.8] Süreç bildirimleri (örnek)')
{
  const op = newOp(null)
  ok('yeni talep → SESSİZ bildirim (silent=true)', sql(`select bool_and(silent)::text from public.notifications where entity_id='${op}' and type='new_operation'`) !== 'false')
  cleanup(op)
}

console.log(`\n${fails === 0 ? '✓ TÜM BİLDİRİM TESTLERİ GEÇTİ' : '✗ ' + fails + ' TEST BAŞARISIZ'}`)
process.exit(fails === 0 ? 0 : 1)
