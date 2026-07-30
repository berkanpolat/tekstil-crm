// =====================================================================
// tekstilas.com talep entegrasyonu testi (E.5). İş mantığı intake_process
// RPC'sinde olduğu için siteye/deploy'a dokunmadan doğrulanır. Her senaryo
// kendi verisini kurar, çağırır, iddia eder, ROLLBACK ile temizler.
// (HTTP uç testi deploy sonrası curl ile; örnek docs/api/talep-ucu.md'de.)
//   node scripts/test-intake.mjs
// =====================================================================
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const pass = process.env.PGPASSWORD || readFileSync('.env','utf8').split('\n').find(l=>l.startsWith('SUPABASE_DB_PASSWORD='))?.split('=').slice(1).join('=').trim()
const ENV = { ...process.env, PGHOST:'aws-0-eu-west-1.pooler.supabase.com', PGPORT:'5432', PGUSER:'postgres.kkxvoxeqfsaqzklrtgrw', PGDATABASE:'postgres', PGPASSWORD:pass }
const run = (sql) => { try { return execFileSync('psql',['-tA','-c',sql],{encoding:'utf8',env:ENV}) } catch(e){ return 'ERR '+(e.stderr||e.message) } }
let fail=0; const ok=(c,m,x='')=>{ if(!c)fail++; console.log(`  ${c?'✅':'❌'} ${m}${x?' → '+x:''}`) }
const J = (o) => JSON.stringify(o).replace(/'/g,"''")
// tek işlemde: intake çağır + iddia SQL'i + rollback → RES satırlarını oku
const scenario = (setup, payload, asserts) => run(`begin;
${setup}
select set_config('x.res', public.intake_process('${J(payload)}'::jsonb)::text, true);
${asserts}
rollback;`)
const val = (out, tag) => (out.split('\n').find(l=>l.startsWith(tag+'|'))||'').split('|')[1] ?? ''

console.log('E.5 — tekstilas.com talep entegrasyonu\n')

// 1) Yeni kişi (upload) → lead+müşteri+operasyon, TAS, sahipsiz, havuz
{ const o = scenario('', {full_name:'Yeni Kişi AŞ', city:'Isparta', phone:'5304567890', email:'y@x.com', mode:'upload', source:'deneme-landing', note:'Görsel ekli'},
  `select 'TAS|'||(current_setting('x.res')::jsonb->>'code');
   select 'OWN|'||coalesce((select owner_id::text from operations where id=(current_setting('x.res')::jsonb->>'operation_id')::bigint),'NULL');
   select 'LS|'||(select landing_source from operations where id=(current_setting('x.res')::jsonb->>'operation_id')::bigint);
   select 'OF|'||(select count(*) from open_files where operation_id=(current_setting('x.res')::jsonb->>'operation_id')::bigint)::text;
   select 'LEAD|'||(select count(*) from leads where full_name='Yeni Kişi AŞ')::text;`)
  ok(/^TAS-/.test(val(o,'TAS')), '1 Yeni kişi → TAS kodu üretildi', val(o,'TAS'))
  ok(val(o,'OWN')==='NULL', '1 Talep sahipsiz düştü (havuz)')
  ok(val(o,'LS')==='deneme-landing', '1 landing_source dolu (rapor grafiği)')
  ok(Number(val(o,'OF'))>=1, '1 Havuz açık dosyası oluştu')
  ok(val(o,'LEAD')==='1', '1 Potansiyel (lead) oluştu → müşteriye çevrildi')
}

// 2) Mevcut müşteri (aynı telefon) → yeni müşteri açılmaz
{ const o = scenario(
  `insert into customers (status_id, company_name) values (1,'Mevcut Firma');
   insert into contact_points (entity_type, entity_id, type, value, is_primary) select 'customer', id, 'phone','+905321112233', true from customers where company_name='Mevcut Firma';`,
  {full_name:'Mevcut Firma', phone:'5321112233', mode:'upload', source:'l'},
  `select 'CUSTID|'||(current_setting('x.res')::jsonb->>'customer_id');
   select 'NCUST|'||(select count(*) from customers where company_name='Mevcut Firma')::text;`)
  ok(val(o,'NCUST')==='1', '2 Mevcut müşteri → yeni müşteri AÇILMADI (mevcuda bağlandı)')
}

// 3) Telefon normalize — 3 farklı yazım aynı E.164
{ const o = run(`select 'N1|'||public.intake_normalize_phone('5304567890');
  select 'N2|'||public.intake_normalize_phone('0530 456 78 90');
  select 'N3|'||public.intake_normalize_phone('+90 530 456 78 90');`)
  ok(val(o,'N1')==='+905304567890' && val(o,'N1')===val(o,'N2') && val(o,'N2')===val(o,'N3'), '3 Telefon normalize (3 yazım → tek E.164)', val(o,'N1'))
}

// 4) Katalogdan seçim → ürün eşleşir + taslak teklif + durum DEĞİŞMEZ
{ const code = run("select code from catalog_products where deleted_at is null limit 1").trim()
  const o = scenario('', {full_name:'Katalog Kişi', phone:'5301234567', mode:'katalog', source:'k', selected_products:[{code, name:'Test Ürün'}]},
  `select 'MATCH|'||(current_setting('x.res')::jsonb->>'matched_products');
   select 'DRAFT|'||coalesce((current_setting('x.res')::jsonb->>'draft_quote_document_id'),'NULL');
   select 'ISDRAFT|'||coalesce((select is_draft::text from documents where id=(current_setting('x.res')::jsonb->>'draft_quote_document_id')::bigint),'?');
   select 'STAGE|'||(select s.key from operations o join operation_stages s on s.id=o.stage_id where o.id=(current_setting('x.res')::jsonb->>'operation_id')::bigint);`)
  ok(val(o,'MATCH')==='1', '4 Katalog ürünü koda göre eşleşti', 'kod='+code)
  ok(val(o,'DRAFT')!=='NULL' && val(o,'ISDRAFT')==='true', '4 Taslak teklif belgesi oluştu (is_draft=true)')
  ok(['talep','teklif_bekliyor'].includes(val(o,'STAGE')), '4 Operasyon durumu DEĞİŞMEDİ (teklif bekliyor)', val(o,'STAGE'))
}

// 5) Eşleşmeyen ürün kodu → null-item olarak eklenir (kartta çözülür)
{ const o = scenario('', {full_name:'Eşleşmeyen', phone:'5309998877', mode:'katalog', source:'k', selected_products:[{code:'YOK-KOD-123', name:'Bilinmeyen'}]},
  `select 'NULLITEM|'||(select (catalog_product_id is null)::text from operation_catalog_items where operation_id=(current_setting('x.res')::jsonb->>'operation_id')::bigint and catalog_product_code='YOK-KOD-123');`)
  ok(val(o,'NULLITEM')==='true', '5 Eşleşmeyen kod → eşleşmemiş kalem (catalog_product_id null)')
}

// 6) Aynı client_reference iki kez → tek kayıt (idempotent)
{ const o = run(`begin;
  select set_config('x.a', public.intake_process('${J({client_reference:'IDEM1', full_name:'İdem Kişi', phone:'5300000001', mode:'upload', source:'s'})}'::jsonb)::text, true);
  select set_config('x.b', public.intake_process('${J({client_reference:'IDEM1', full_name:'İdem Kişi', phone:'5300000001', mode:'upload', source:'s'})}'::jsonb)::text, true);
  select 'SAME|'||((current_setting('x.a')::jsonb->>'operation_id')=(current_setting('x.b')::jsonb->>'operation_id'))::text;
  select 'IDEMP|'||(current_setting('x.b')::jsonb->>'idempotent');
  rollback;`)
  ok(val(o,'SAME')==='true' && val(o,'IDEMP')==='true', '6 Aynı client_reference iki kez → tek kayıt (idempotent)')
}

// 7) Açık talebi olan müşteri → possible_merge_with dolu
{ const o = scenario(
  `insert into customers (status_id, company_name) values (1,'Açık Talepli');
   insert into contact_points (entity_type, entity_id, type, value, is_primary) select 'customer', id, 'phone','+905307654321', true from customers where company_name='Açık Talepli';
   insert into operations (code, customer_id, title, requested_at) select 'TAS-OPEN1', id, 'Açık talep', now() from customers where company_name='Açık Talepli';`,
  {full_name:'Açık Talepli', phone:'5307654321', mode:'upload', source:'s'},
  `select 'MERGE|'||coalesce((current_setting('x.res')::jsonb->>'possible_merge_with'),'NULL');`)
  ok(val(o,'MERGE')!=='NULL', '7 Açık talep varken possible_merge_with dolu (birleştirme önerisi)')
}

console.log(`\n${fail===0?'✅ E.5 — tüm senaryolar geçti':'❌'} — ${fail} başarısız.`)
process.exit(fail?1:0)
