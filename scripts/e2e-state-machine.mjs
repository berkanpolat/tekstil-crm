// =====================================================================
// Regresyon — Durum makinesi otomasyonu (1.1). Tümü tek transaction, ROLLBACK.
// Doğrular:
//   • İlk etkileşim: lead yeni → temas_kuruldu; sonraki etkileşim statüyü bozmaz
//   • op_advance_stage yalnız ileri gider; Tamamlandı/İptal'de sabit kalır
//   • Numune/sipariş → aşama ilerlemesi (op_advance_stage üzerinden)
//   • Teklif reddi → başka açık teklif yoksa İptal; varsa operasyon açık kalır
// Bağlantı: PG* env / .env SUPABASE_DB_PASSWORD. Ağ: dangerouslyDisableSandbox.
// =====================================================================
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const pass = process.env.PGPASSWORD ||
  (readFileSync('.env', 'utf8').split('\n').find((l) => l.startsWith('SUPABASE_DB_PASSWORD='))?.split('=').slice(1).join('=').trim())
const ENV = { ...process.env, PGHOST: process.env.PGHOST || 'aws-0-eu-west-1.pooler.supabase.com',
  PGPORT: process.env.PGPORT || '5432', PGUSER: process.env.PGUSER || 'postgres.kkxvoxeqfsaqzklrtgrw',
  PGDATABASE: process.env.PGDATABASE || 'postgres', PGPASSWORD: pass }

const SQL = `
begin;
-- 1) lead ilk etkileşim → temas_kuruldu
insert into public.leads (status_id, company_name) select id,'SM-Reg' from public.lead_statuses where key='yeni';
insert into public.interactions (entity_type, entity_id, channel_id)
  select 'lead',(select id from public.leads where company_name='SM-Reg'),(select id from public.interaction_channels limit 1);
select 'T1' as test, (select ls.key from leads l join lead_statuses ls on ls.id=l.status_id where l.company_name='SM-Reg') as got, 'temas_kuruldu' as want;
-- ikinci etkilesim statuyu korur
update public.leads set status_id=(select id from lead_statuses where key='ilgileniyor') where company_name='SM-Reg';
insert into public.interactions (entity_type, entity_id, channel_id)
  select 'lead',(select id from public.leads where company_name='SM-Reg'),(select id from public.interaction_channels limit 1);
select 'T2' as test, (select ls.key from leads l join lead_statuses ls on ls.id=l.status_id where l.company_name='SM-Reg') as got, 'ilgileniyor' as want;

-- 2) aşama ilerlemesi + terminal koruma
with c as (insert into public.customers (status_id, company_name) select id,'SM-Reg-Op' from public.customer_statuses limit 1 returning id)
insert into public.operations (code, customer_id, stage_id, title)
  select 'TAS-SMREG', c.id, (select id from operation_stages where key='teklif_iletildi'),'x' from c;
select public.op_advance_stage((select id from operations where code='TAS-SMREG'),'numune');
select public.op_advance_stage((select id from operations where code='TAS-SMREG'),'teklif_iletildi'); -- geri gitmemeli
select 'T3' as test, (select s.key from operations o join operation_stages s on s.id=o.stage_id where o.code='TAS-SMREG') as got, 'numune' as want;
select public.op_set_stage((select id from operations where code='TAS-SMREG'),'iptal');
select public.op_advance_stage((select id from operations where code='TAS-SMREG'),'uretim'); -- iptalde sabit
select 'T4' as test, (select s.key from operations o join operation_stages s on s.id=o.stage_id where o.code='TAS-SMREG') as got, 'iptal' as want;

-- 3) teklif reddi → tek teklifte iptal
with c as (insert into public.customers (status_id, company_name) select id,'SM-Reg-QR' from public.customer_statuses limit 1 returning id)
insert into public.operations (code, customer_id, stage_id, title)
  select 'TAS-SMQR', c.id, (select id from operation_stages where key='teklif_iletildi'),'x' from c;
insert into public.quotes (operation_id, version, valid_until, tax_rate, status_id)
  select (select id from operations where code='TAS-SMQR'),1,now()+interval '7 days',10,(select id from quote_statuses where key='cevap_bekleniyor');
update public.quotes set status_id=(select id from quote_statuses where key='reddedildi'), rejection_note='x'
  where operation_id=(select id from operations where code='TAS-SMQR');
select 'T5' as test, (select s.key from operations o join operation_stages s on s.id=o.stage_id where o.code='TAS-SMQR') as got, 'iptal' as want;

-- 4) iki teklif, biri açık → iptal olmamalı
with c as (insert into public.customers (status_id, company_name) select id,'SM-Reg-QR2' from public.customer_statuses limit 1 returning id)
insert into public.operations (code, customer_id, stage_id, title)
  select 'TAS-SMQR2', c.id, (select id from operation_stages where key='teklif_iletildi'),'x' from c;
insert into public.quotes (operation_id, version, valid_until, tax_rate, status_id)
  select (select id from operations where code='TAS-SMQR2'),1,now()+interval '7 days',10,(select id from quote_statuses where key='cevap_bekleniyor');
insert into public.quotes (operation_id, version, valid_until, tax_rate, status_id)
  select (select id from operations where code='TAS-SMQR2'),2,now()+interval '7 days',10,(select id from quote_statuses where key='cevap_bekleniyor');
update public.quotes set status_id=(select id from quote_statuses where key='reddedildi'), rejection_note='x'
  where operation_id=(select id from operations where code='TAS-SMQR2') and version=1;
select 'T6' as test, (select s.key from operations o join operation_stages s on s.id=o.stage_id where o.code='TAS-SMQR2') as got, 'teklif_iletildi' as want;
rollback;
`

const out = execFileSync('psql', ['-tA', '-F', '|', '-v', 'ON_ERROR_STOP=1', '-c', SQL], { encoding: 'utf8', env: ENV })
const rows = out.split('\n').filter((l) => /^T\d\|/.test(l))
let fail = 0
for (const r of rows) {
  const [test, got, want] = r.split('|')
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? '✅' : '❌'} ${test}: ${got}${ok ? '' : ` (beklenen: ${want})`}`)
}
if (rows.length < 6) { console.error(`\n❌ Beklenen 6 test, ${rows.length} çıktı alındı.`); process.exit(1) }
console.log(fail === 0 ? `\n✅ Durum makinesi: 6/6 geçti.` : `\n❌ ${fail} test başarısız.`)
process.exit(fail === 0 ? 0 : 1)
