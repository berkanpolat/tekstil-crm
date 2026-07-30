// =====================================================================
// Düzeltme turu · madde 6 — durum makinesi alt-kayıt ilişki testleri.
// Her senaryo kendi verisini kurar, iddia eder, ROLLBACK ile temizler.
//   node scripts/e2e-durum-cascade.mjs
// =====================================================================
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const pass = process.env.PGPASSWORD || readFileSync('.env','utf8').split('\n').find(l=>l.startsWith('SUPABASE_DB_PASSWORD='))?.split('=').slice(1).join('=').trim()
const ENV = { ...process.env, PGHOST:'aws-0-eu-west-1.pooler.supabase.com', PGPORT:'5432', PGUSER:'postgres.kkxvoxeqfsaqzklrtgrw', PGDATABASE:'postgres', PGPASSWORD:pass }
const run = (sql) => { try { return execFileSync('psql',['-tA','-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8',env:ENV}) } catch(e){ return 'ERR: '+(e.stderr||e.message) } }
const OWNER='5261d58d-52f5-4859-ba26-bcb0ace8f743'
let fail=0
const check = (out) => out.split('\n').filter(l=>l.startsWith('RES|')).forEach(l=>{ const [,d,r,x]=l.split('|'); if(r!=='PASS')fail++; console.log(`  ${r==='PASS'?'✅':'❌'} ${d}${x?' → '+x:''}`) })

// Ortak kurulum: müşteri + operasyon + siparis_onay belgesi (sert kapı için)
const SETUP = (n) => `
set local request.jwt.claims='{"sub":"${OWNER}"}';
insert into public.customers (status_id, company_name) values (1, 'CAS ${n}');
insert into public.operations (code, customer_id, title, requested_at)
  select 'TAS-CAS${n}', c.id, 'CAS#${n}', now() from public.customers c where c.company_name='CAS ${n}';
insert into public.documents (operation_id, document_type_id)
  select o.id, (select id from public.document_types where key='siparis_onay') from public.operations o where o.title='CAS#${n}';`
const OPID = (n) => `(select id from public.operations where title='CAS#${n}')`
const stageKey = (n) => `(select s.key from public.operations o join public.operation_stages s on s.id=o.stage_id where o.title='CAS#${n}')`

console.log('Madde 6 — durum makinesi alt-kayıt ilişkileri\n')

// 1) Sipariş üretimde → op 'uretim'
check(run(`begin;${SETUP(1)}
insert into public.orders (operation_id, subtotal, tax_rate, total, currency, status_id)
  select ${OPID(1)}, 100, 0, 100, 'USD', (select id from public.order_statuses where key='olusturuldu');
update public.orders set status_id=(select id from public.order_statuses where key='uretimde') where operation_id=${OPID(1)};
select 'RES|1 Sipariş üretimde → op uretim|'||case when ${stageKey(1)}='uretim' then 'PASS' else 'FAIL' end||'|'||${stageKey(1)};
rollback;`))

// 2) Sipariş kargoda → op 'teslimat'
check(run(`begin;${SETUP(2)}
insert into public.orders (operation_id, subtotal, tax_rate, total, currency, status_id)
  select ${OPID(2)}, 100, 0, 100, 'USD', (select id from public.order_statuses where key='uretimde');
update public.orders set status_id=(select id from public.order_statuses where key='kargoda') where operation_id=${OPID(2)};
select 'RES|2 Sipariş kargoda → op teslimat|'||case when ${stageKey(2)}='teslimat' then 'PASS' else 'FAIL' end||'|'||${stageKey(2)};
rollback;`))

// 3) Sipariş teslim → op tamamlandi + numune teslim(kapalı) + teklif kabul + açık dosyalar kapalı
check(run(`begin;${SETUP(3)}
insert into public.quotes (operation_id, version, valid_until, tax_rate, status_id)
  select ${OPID(3)}, 1, now()+interval '7 days', 10, (select id from public.quote_statuses where key='cevap_bekleniyor');
insert into public.samples (operation_id, version, status_id)
  select ${OPID(3)}, 1, (select id from public.sample_statuses where key='kargoda');
insert into public.orders (operation_id, subtotal, tax_rate, total, currency, status_id)
  select ${OPID(3)}, 100, 0, 100, 'USD', (select id from public.order_statuses where key='kargoda');
update public.orders set status_id=(select id from public.order_statuses where key='teslim_edildi') where operation_id=${OPID(3)};
select 'RES|3 Sipariş teslim → op tamamlandi|'||case when ${stageKey(3)}='tamamlandi' then 'PASS' else 'FAIL' end||'|'||${stageKey(3)};
select 'RES|3 Bağlı numune → teslim_edildi (kargoda kalmasın)|'||case when (select sk.key from public.samples s join public.sample_statuses sk on sk.id=s.status_id where s.operation_id=${OPID(3)})='teslim_edildi' then 'PASS' else 'FAIL' end;
select 'RES|3 Bağlı teklif → kabul_edildi|'||case when (select qk.key from public.quotes q join public.quote_statuses qk on qk.id=q.status_id where q.operation_id=${OPID(3)})='kabul_edildi' then 'PASS' else 'FAIL' end;
select 'RES|3 Açık dosyalar kapandı|'||case when (select count(*) from public.open_files where operation_id=${OPID(3)} and closed_at is null)=0 then 'PASS' else 'FAIL' end;
rollback;`))

// 4) Sipariş iptal → op iptal + açık dosyalar kapalı
check(run(`begin;${SETUP(4)}
insert into public.orders (operation_id, subtotal, tax_rate, total, currency, status_id)
  select ${OPID(4)}, 100, 0, 100, 'USD', (select id from public.order_statuses where key='uretimde');
update public.orders set status_id=(select id from public.order_statuses where key='iptal_edildi') where operation_id=${OPID(4)};
select 'RES|4 Sipariş iptal → op iptal|'||case when ${stageKey(4)}='iptal' then 'PASS' else 'FAIL' end||'|'||${stageKey(4)};
select 'RES|4 Açık dosyalar kapandı|'||case when (select count(*) from public.open_files where operation_id=${OPID(4)} and closed_at is null)=0 then 'PASS' else 'FAIL' end;
rollback;`))

// 5) Op iptal → tüm alt kayıtlar kapanış
check(run(`begin;${SETUP(5)}
insert into public.quotes (operation_id, version, valid_until, tax_rate, status_id)
  select ${OPID(5)}, 1, now()+interval '7 days', 10, (select id from public.quote_statuses where key='cevap_bekleniyor');
insert into public.samples (operation_id, version, status_id)
  select ${OPID(5)}, 1, (select id from public.sample_statuses where key='inceleniyor');
insert into public.orders (operation_id, subtotal, tax_rate, total, currency, status_id)
  select ${OPID(5)}, 100, 0, 100, 'USD', (select id from public.order_statuses where key='uretimde');
select public.op_set_stage(${OPID(5)}, 'iptal');
select 'RES|5 Op iptal → teklif kapalı|'||case when (select is_closed from public.quote_statuses qs join public.quotes q on q.status_id=qs.id where q.operation_id=${OPID(5)}) then 'PASS' else 'FAIL' end;
select 'RES|5 Op iptal → numune kapalı|'||case when (select is_closed from public.sample_statuses ss join public.samples s on s.status_id=ss.id where s.operation_id=${OPID(5)}) then 'PASS' else 'FAIL' end;
select 'RES|5 Op iptal → sipariş kapalı|'||case when (select is_closed from public.order_statuses os join public.orders o on o.status_id=os.id where o.operation_id=${OPID(5)}) then 'PASS' else 'FAIL' end;
rollback;`))

// 6) Tek teklif reddedildi → op iptal (mevcut trigger) + cascade
check(run(`begin;${SETUP(6)}
insert into public.quotes (operation_id, version, valid_until, tax_rate, status_id)
  select ${OPID(6)}, 1, now()+interval '7 days', 10, (select id from public.quote_statuses where key='cevap_bekleniyor');
update public.quotes set status_id=(select id from public.quote_statuses where key='reddedildi'), rejection_reason_id=(select id from public.quote_rejection_reasons order by id limit 1) where operation_id=${OPID(6)};
select 'RES|6 Tek teklif red → op iptal|'||case when ${stageKey(6)}='iptal' then 'PASS' else 'FAIL' end||'|'||${stageKey(6)};
rollback;`))

console.log(`\n${fail===0?'✅ Madde 6':'❌'} — ${fail} başarısız.`)
process.exit(fail?1:0)
