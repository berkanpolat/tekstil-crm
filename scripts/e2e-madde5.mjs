// =====================================================================
// Düzeltme turu · madde 5 — talebe bağlı sipariş formundan sipariş oluşturma.
// DB davranışı: siparis_onay belgesi varken YÜKLEME olmadan (dosyasız) sipariş
// oluşabilmeli; belgesi yokken sert kapı engellemeli. Belgeden alan çekme (belge
// modu) frontend fetchOrderDocFields ile documents.data'dan okur (UI testinde).
//   node scripts/e2e-madde5.mjs
// =====================================================================
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const pass = process.env.PGPASSWORD || readFileSync('.env','utf8').split('\n').find(l=>l.startsWith('SUPABASE_DB_PASSWORD='))?.split('=').slice(1).join('=').trim()
const ENV = { ...process.env, PGHOST:'aws-0-eu-west-1.pooler.supabase.com', PGPORT:'5432', PGUSER:'postgres.kkxvoxeqfsaqzklrtgrw', PGDATABASE:'postgres', PGPASSWORD:pass }
const run = (sql) => { try { return execFileSync('psql',['-tA','-c',sql],{encoding:'utf8',env:ENV}) } catch(e){ return 'ERR: '+(e.stderr||e.message) } }
const OWNER='5261d58d-52f5-4859-ba26-bcb0ace8f743'
let fail=0; const ok=(c,m)=>{ if(!c)fail++; console.log(`  ${c?'✅':'❌'} ${m}`) }
console.log('Madde 5 — belgeden sipariş oluşturma\n')

// A) siparis_onay VAR → dosyasız sipariş oluşur
const a = run(`begin; set local request.jwt.claims='{"sub":"${OWNER}"}';
insert into public.customers (status_id, company_name) values (1,'M5A');
insert into public.operations (code, customer_id, title, requested_at) select 'TAS-M5A', id, 'M5A', now() from public.customers where company_name='M5A';
insert into public.documents (operation_id, document_type_id) select (select id from public.operations where title='M5A'), (select id from public.document_types where key='siparis_onay');
insert into public.orders (operation_id, subtotal, tax_rate, total, currency) select (select id from public.operations where title='M5A'), 100,0,100,'USD';
select 'CNT'||(select count(*) from public.orders o join public.operations op on op.id=o.operation_id where op.title='M5A');
rollback;`)
ok(/CNT1/.test(a), 'Onay belgesi varken YÜKLEME olmadan (dosyasız) sipariş oluşur')

// B) siparis_onay YOK → sert kapı engeller
const b = run(`begin; set local request.jwt.claims='{"sub":"${OWNER}"}';
insert into public.customers (status_id, company_name) values (1,'M5B');
insert into public.operations (code, customer_id, title, requested_at) select 'TAS-M5B', id, 'M5B', now() from public.customers where company_name='M5B';
insert into public.orders (operation_id, subtotal, tax_rate, total, currency) select (select id from public.operations where title='M5B'), 100,0,100,'USD';
rollback;`)
ok(/onay formu/i.test(b) || /require_siparis_onay/.test(b), 'Onay belgesi yokken sert kapı siparişi engeller')

// C) order_file_id nullable (dosyasız modele izin)
ok(/YES/.test(run("select is_nullable from information_schema.columns where table_name='orders' and column_name='order_file_id'")), 'order_file_id nullable — dosyasız sipariş şema düzeyinde mümkün')

console.log(`\n${fail===0?'✅ Madde 5':'❌'} — ${fail} başarısız.`)
process.exit(fail?1:0)
