-- =====================================================================
-- P1.8 dönüşüm sayımlı testi. Dolu lead + alt kayıtlar → convert → say/doğrula.
-- Tek bir kayıt eksikse RAISE EXCEPTION → transaction abort → psql exit≠0.
-- Sonunda ROLLBACK: test verisi kalıcı OLMAZ (kendini temizler).
-- Çalıştırma: psql -v ON_ERROR_STOP=1 -f scripts/test-conversion.sql
-- =====================================================================
\set ON_ERROR_STOP on
begin;
do $$
declare
  v_user   uuid;
  v_source bigint;
  v_type   bigint;
  v_tag1   bigint;
  v_tag2   bigint;
  v_lead   bigint;
  v_cust   bigint;
  v_before_ids   bigint[];
  v_before_oldest timestamptz;
  v_after_oldest  timestamptz;
  v_newest_inter  timestamptz;
  v_moved  int;
  v_left   int;
  n int;
begin
  select id into v_user from public.users where deleted_at is null limit 1;
  select id into v_source from public.lead_sources where key = 'fuar';
  select id into v_type from public.customer_types where key = 'yurtici';
  select id into v_tag1 from public.tags where key = 'premium';
  select id into v_tag2 from public.tags where key = 'vip';

  -- Dolu lead (her alan)
  insert into public.leads (full_name, company_name, sector, country, city, district, address,
      source_id, assigned_to, next_action_at, external_source, external_id)
  values ('Test Kişi', 'Dönüşüm Test Tekstil A.Ş.', 'Örme Kumaş', 'Türkiye', 'Bursa', 'Nilüfer',
      'OSB 5. Cadde No:10', v_source, v_user, now() + interval '2 days', 'teklead', 'conv-test-1')
  returning id into v_lead;

  -- 1 iletişim noktası
  insert into public.contact_points (entity_type, entity_id, type, value)
  values ('lead', v_lead, 'phone', '05321234567');

  -- 5 etkileşim (occurred_at 10→2 gün önce; en yenisi = 2 gün önce)
  insert into public.interactions (entity_type, entity_id, channel_id, direction, summary, occurred_at)
  select 'lead', v_lead, (select id from public.interaction_channels where key='telefon'),
         'outbound', 'Etkileşim '||g, now() - (g || ' days')::interval
  from generate_series(2, 10, 2) g;   -- 2,4,6,8,10 → 5 kayıt
  select max(occurred_at) into v_newest_inter from public.interactions
    where entity_type='lead' and entity_id=v_lead;

  -- 3 not
  insert into public.notes (entity_type, entity_id, body)
  select 'lead', v_lead, 'Not '||g from generate_series(1,3) g;

  -- 2 etiket
  insert into public.entity_tags (entity_type, entity_id, tag_id) values
    ('lead', v_lead, v_tag1), ('lead', v_lead, v_tag2);

  -- 2 dosya (DB kaydı; storage nesnesi testte gerekmiyor)
  insert into public.files (bucket, storage_path, original_name, mime_type, size_bytes, category, entity_type, entity_id, uploaded_by)
  values ('documents', 'document/conv-test-1.pdf', 'sozlesme.pdf', 'application/pdf', 1024, 'document', 'lead', v_lead::text, v_user),
         ('documents', 'document/conv-test-2.png', 'gorsel.png', 'image/png', 2048, 'image', 'lead', v_lead::text, v_user);

  -- Dönüşüm ÖNCESİ event_log durumu (id bazlı izleme — relink'i birebir doğrular)
  select array_agg(id), min(occurred_at) into v_before_ids, v_before_oldest
  from public.event_log where entity_type='lead' and entity_id=v_lead::text;
  raise notice 'ÖNCE: lead event sayısı=%, en eski occurred_at=%', array_length(v_before_ids,1), v_before_oldest;

  -- ======= DÖNÜŞÜM =======
  v_cust := public.convert_lead_to_customer(v_lead, v_type, 'Bursa VD', '1234567890', 'TR12 3456 7890 1234 5678 90');
  raise notice 'Müşteri oluşturuldu: id=%', v_cust;

  -- ======= DOĞRULAMALAR =======
  -- Alt kayıtlar: kaynak(lead)=0
  select count(*) into n from public.interactions where entity_type='lead' and entity_id=v_lead;   if n<>0 then raise exception 'FAIL: lead interactions=% (0 bekleniyor)', n; end if;
  select count(*) into n from public.notes where entity_type='lead' and entity_id=v_lead;           if n<>0 then raise exception 'FAIL: lead notes=%', n; end if;
  select count(*) into n from public.entity_tags where entity_type='lead' and entity_id=v_lead;     if n<>0 then raise exception 'FAIL: lead tags=%', n; end if;
  select count(*) into n from public.files where entity_type='lead' and entity_id=v_lead::text;     if n<>0 then raise exception 'FAIL: lead files=%', n; end if;
  select count(*) into n from public.contact_points where entity_type='lead' and entity_id=v_lead;  if n<>0 then raise exception 'FAIL: lead contacts=%', n; end if;

  -- Alt kayıtlar: hedef(customer)=tam
  select count(*) into n from public.interactions where entity_type='customer' and entity_id=v_cust;  if n<>5 then raise exception 'FAIL: customer interactions=% (5)', n; end if;
  select count(*) into n from public.notes where entity_type='customer' and entity_id=v_cust;          if n<>3 then raise exception 'FAIL: customer notes=% (3)', n; end if;
  select count(*) into n from public.entity_tags where entity_type='customer' and entity_id=v_cust;    if n<>2 then raise exception 'FAIL: customer tags=% (2)', n; end if;
  select count(*) into n from public.files where entity_type='customer' and entity_id=v_cust::text;    if n<>2 then raise exception 'FAIL: customer files=% (2)', n; end if;
  select count(*) into n from public.contact_points where entity_type='customer' and entity_id=v_cust; if n<>1 then raise exception 'FAIL: customer contacts=% (1)', n; end if;

  -- event_log: ÖNCEKİ her olay artık customer'da, hiçbiri lead'de değil
  select count(*) into v_moved from public.event_log where id = any(v_before_ids) and entity_type='customer' and entity_id=v_cust::text;
  select count(*) into v_left  from public.event_log where id = any(v_before_ids) and entity_type='lead';
  if v_moved <> array_length(v_before_ids,1) then raise exception 'FAIL: taşınan event=%/%', v_moved, array_length(v_before_ids,1); end if;
  if v_left <> 0 then raise exception 'FAIL: lead''de kalan eski event=%', v_left; end if;

  -- occurred_at KORUNDU: taşınan olayların en eskisi öncesi=sonrası
  select min(occurred_at) into v_after_oldest from public.event_log where id = any(v_before_ids);
  if v_after_oldest is distinct from v_before_oldest then
    raise exception 'FAIL: en eski occurred_at değişti! önce=% sonra=%', v_before_oldest, v_after_oldest;
  end if;

  -- last_interaction_at: customer = en yeni etkileşim; lead = null
  select last_interaction_at into v_after_oldest from public.customers where id=v_cust;
  if v_after_oldest is distinct from v_newest_inter then
    raise exception 'FAIL: customer.last_interaction_at=% (en yeni etkileşim=% bekleniyor)', v_after_oldest, v_newest_inter;
  end if;
  if (select last_interaction_at from public.leads where id=v_lead) is not null then raise exception 'FAIL: lead.last_interaction_at null değil'; end if;
  if (select next_action_at from public.leads where id=v_lead) is not null then raise exception 'FAIL: lead.next_action_at null değil'; end if;

  -- Alan taşıma: source_id, customer_type, ticari, dönüşüm bağı, durum
  if (select source_id from public.customers where id=v_cust) is distinct from v_source then raise exception 'FAIL: source_id taşınmadı'; end if;
  if (select customer_type_id from public.customers where id=v_cust) <> v_type then raise exception 'FAIL: customer_type_id yanlış'; end if;
  if (select tax_number from public.customers where id=v_cust) <> '1234567890' then raise exception 'FAIL: tax_number yazılmadı'; end if;
  if (select converted_customer_id from public.leads where id=v_lead) <> v_cust then raise exception 'FAIL: lead.converted_customer_id yanlış'; end if;
  if (select key from public.lead_statuses s join public.leads l on l.status_id=s.id where l.id=v_lead) <> 'donusturuldu' then raise exception 'FAIL: lead durumu donusturuldu değil'; end if;
  if (select customer_code from public.customers where id=v_cust) not like 'MUS-%' then raise exception 'FAIL: customer_code MUS değil'; end if;

  raise notice '===== SENARYO 0 (mutlu yol) PASS =====';
  raise notice 'lead #% → customer #% (kod %); % olay taşındı, en eski occurred_at % korundu',
    v_lead, v_cust, (select customer_code from public.customers where id=v_cust),
    array_length(v_before_ids,1), v_before_oldest;
end $$;
rollback;  -- test verisi kalıcı olmaz

-- =====================================================================
-- SENARYO 1 — Aynı lead'i iki kez dönüştürme: ikincisi reddedilmeli,
-- ortada iki müşteri kalmamalı (tek converted_from_lead_id).
-- =====================================================================
begin;
do $$
declare
  v_type bigint; v_lead bigint; v_c1 bigint; v_ok boolean := false; n int;
begin
  select id into v_type from public.customer_types where key='yurtici';
  insert into public.leads (company_name, city) values ('İki Kez Dönüşüm A.Ş.', 'Bursa') returning id into v_lead;
  v_c1 := public.convert_lead_to_customer(v_lead, v_type);        -- 1. dönüşüm: başarılı
  begin
    perform public.convert_lead_to_customer(v_lead, v_type);      -- 2. dönüşüm: reddedilmeli
  exception when others then
    v_ok := true;                                                  -- beklenen reddediliş
  end;
  if not v_ok then raise exception 'FAIL: ikinci dönüşüm reddedilmedi (mükerrer müşteri riski)'; end if;
  select count(*) into n from public.customers where converted_from_lead_id = v_lead;
  if n <> 1 then raise exception 'FAIL: converted_from_lead_id=% için müşteri sayısı=% (1 bekleniyor)', v_lead, n; end if;
  raise notice '===== SENARYO 1 PASS: ikinci dönüşüm reddedildi, tek müşteri (#%) =====', v_c1;
end $$;
rollback;

-- =====================================================================
-- SENARYO 2 — p_customer_type_id NULL: exception + HİÇBİR ŞEY DEĞİŞMEMELİ.
-- Atomiklik testi: convert çağrısı alt-transaction'da; yakalanınca prior
-- statement'lar geri alınır. Sonrası: customer yok, alt kayıt lead'de, durum aynı.
-- =====================================================================
begin;
do $$
declare
  v_lead bigint; v_status_before bigint; v_ok boolean := false; n int;
begin
  insert into public.leads (company_name, city, next_action_at) values ('Null Tür A.Ş.', 'İzmir', now()+interval '1 day') returning id into v_lead;
  insert into public.interactions (entity_type, entity_id, channel_id, occurred_at)
    values ('lead', v_lead, (select id from public.interaction_channels where key='telefon'), now());
  insert into public.notes (entity_type, entity_id, body) values ('lead', v_lead, 'atomiklik testi');
  select status_id into v_status_before from public.leads where id=v_lead;

  begin
    perform public.convert_lead_to_customer(v_lead, null);         -- null tür → exception
  exception when others then
    v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL: null tür exception fırlatmadı'; end if;

  -- HİÇBİR ŞEY DEĞİŞMEMELİ:
  if exists (select 1 from public.customers where converted_from_lead_id=v_lead) then raise exception 'FAIL: customers''a satır eklenmiş (rollback olmadı)'; end if;
  select count(*) into n from public.interactions where entity_type='lead' and entity_id=v_lead; if n<>1 then raise exception 'FAIL: etkileşim lead''de değil (n=%)', n; end if;
  select count(*) into n from public.notes where entity_type='lead' and entity_id=v_lead;        if n<>1 then raise exception 'FAIL: not lead''de değil (n=%)', n; end if;
  if (select status_id from public.leads where id=v_lead) is distinct from v_status_before then raise exception 'FAIL: lead durumu değişti'; end if;
  if (select converted_customer_id from public.leads where id=v_lead) is not null then raise exception 'FAIL: lead.converted_customer_id set edilmiş'; end if;
  raise notice '===== SENARYO 2 PASS: null tür reddedildi, hiçbir şey değişmedi (atomik) =====';
end $$;
rollback;
