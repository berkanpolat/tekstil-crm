-- Pazarlama kanalı: siteden gelen kaynak-takip verisi (kanal, utm_*, tıklama kimlikleri) CRM'e girer,
-- tek kanala indirgenir ve raporda "kanal dağılımı" olarak çıkar. Elle açılan taleplerde
-- Data / Dış Arama / Gelen Arama gibi kanallar formdan seçilir.
-- Karar: Tuna, 21 Eyl 2026 (genel istekler #9).

create table if not exists public.marketing_channels (
  id bigint generated always as identity primary key,
  key text not null unique,
  label text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.marketing_channels enable row level security;
drop policy if exists marketing_channels_read on public.marketing_channels;
create policy marketing_channels_read on public.marketing_channels for select to authenticated using (true);

insert into public.marketing_channels (key, label, sort_order) values
  ('meta_fb',    'Meta / Facebook', 10),
  ('meta_ig',    'Meta / Instagram', 20),
  ('meta',       'Meta (FB/IG ayrımsız)', 30),
  ('search',     'Arama (Google/Bing reklam)', 40),
  ('tiktok',     'TikTok', 50),
  ('pinterest',  'Pinterest', 60),
  ('organik',    'Organik', 70),
  ('yapay_zeka', 'YZ asistanı (ChatGPT vb.)', 75),
  ('dogrudan',   'Doğrudan', 80),
  ('kampanya',   'Site kampanyası', 85),
  ('data',       'Data', 90),
  ('dis_arama',  'Dış Arama', 100),
  ('gelen_arama','Gelen Arama', 110),
  ('bilinmiyor', 'Bilinmiyor', 999)
on conflict (key) do nothing;

alter table public.operations
  add column if not exists marketing jsonb,
  add column if not exists marketing_channel_id bigint references public.marketing_channels(id);
create index if not exists operations_marketing_channel_idx on public.operations (marketing_channel_id);

-- Ham kaynak JSON'undan tek kanal anahtarı. Öncelik: tıklama kimliği > utm_source > kanal.
create or replace function public.pazarlama_kanali_bul(p jsonb)
returns text language plpgsql immutable as $$
declare src text; med text; kanal text; ref text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return 'bilinmiyor'; end if;
  src := lower(coalesce(p->>'utm_source',''));
  med := lower(coalesce(p->>'utm_medium',''));
  kanal := lower(coalesce(p->>'kanal',''));
  ref := lower(coalesce(p->>'referrer',''));
  if coalesce(p->>'ttclid','') <> '' or src like '%tiktok%' then return 'tiktok'; end if;
  if src like '%pinterest%' or ref like '%pinterest%' then return 'pinterest'; end if;
  if src in ('ig','instagram') or (coalesce(p->>'fbclid','') <> '' and ref like '%instagram%') then return 'meta_ig'; end if;
  if src in ('facebook','fb') or (coalesce(p->>'fbclid','') <> '' and ref like '%facebook%') then return 'meta_fb'; end if;
  if coalesce(p->>'fbclid','') <> '' or src = 'meta' then return 'meta'; end if;
  if coalesce(p->>'gclid','') <> '' or coalesce(p->>'msclkid','') <> '' or src in ('google','bing') or kanal = 'ucretli_arama' then return 'search'; end if;
  if src like '%chatgpt%' or src like '%openai%' or src like '%perplexity%' or ref like '%chatgpt%' or ref like '%openai%' or ref like '%perplexity%' or ref like '%gemini%' then return 'yapay_zeka'; end if;
  if kanal = 'ucretli_sosyal' then return 'meta'; end if;
  if kanal = 'kampanya' or med = 'kampanya' or med = 'lp-kampanya' then return 'kampanya'; end if;
  if kanal in ('organik_arama','sosyal','organik') then return 'organik'; end if;
  if kanal = 'dogrudan' then return 'dogrudan'; end if;
  return 'bilinmiyor';
end $$;

-- intake_process: kaynak JSON'u + tanınan kanal operasyona yazılır (yalnız insert satırı değişti)
CREATE OR REPLACE FUNCTION public.intake_process(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ref text := nullif(trim(p->>'client_reference'),'');
  v_name text := nullif(trim(p->>'full_name'),'');
  v_city text := nullif(trim(p->>'city'),'');
  v_phone text := public.intake_normalize_phone(p->>'phone');
  v_email text := nullif(trim(p->>'email'),'');
  v_mode text := lower(coalesce(p->>'mode',''));
  v_source text := nullif(trim(p->>'source'),'');
  v_note text := nullif(trim(p->>'note'),'');
  v_products jsonb := coalesce(p->'selected_products','[]'::jsonb);
  v_cust_id bigint; v_lead_id bigint; v_op_id bigint; v_op_code text;
  v_prov_id bigint; v_open_op bigint; v_prod_source text; v_dm record;
  v_unmatched text := ''; v_matched int := 0; v_prod jsonb; v_cpid bigint; v_draft bigint;
  v_esleme_notu text; v_benzer_notu text;
begin
  -- idempotency
  if v_ref is not null then
    select id, code into v_op_id, v_op_code from operations where client_reference = v_ref limit 1;
    if v_op_id is not null then
      return jsonb_build_object('ok',true,'code',v_op_code,'operation_id',v_op_id,'idempotent',true);
    end if;
  end if;

  -- 1) Eşleştir — KARAR (21 Eyl 2026): TELEFON öncelikli, sonra TAM İSİM (uyarılı),
  --    benzer isim ASLA otomatik bağlamaz (yalnız not). Gerekçe: 471 talepte 1 yanlış
  --    bağlama (aynı isim, farklı numara) görüldü; find_duplicates'ta telefon ve isim
  --    aynı öncelikteydi ve %75 benzerlik de bağlıyordu.
  -- 1a) Telefon: contact_points üzerinden; silinmemiş müşteri > lead
  if v_phone is not null then
    select cp.entity_id into v_cust_id from contact_points cp
      join customers c on c.id = cp.entity_id and c.deleted_at is null
      where cp.entity_type = 'customer' and cp.type in ('phone','whatsapp') and cp.value_normalized = v_phone
      order by cp.is_primary desc, cp.entity_id limit 1;
    if v_cust_id is null then
      select cp.entity_id into v_lead_id from contact_points cp
        join leads l on l.id = cp.entity_id and l.deleted_at is null
        where cp.entity_type = 'lead' and cp.type in ('phone','whatsapp') and cp.value_normalized = v_phone
        order by cp.is_primary desc, cp.entity_id limit 1;
    end if;
  end if;
  -- 1b) Telefon tutmadı → TAM isim (normalize edilmiş, aynı çekirdek). Bağlanır ama uyarı düşer,
  --     yeni numara müşteriye ikincil telefon olarak eklenir (bir sonraki talep telefonla bulunsun).
  if v_cust_id is null and v_lead_id is null and v_name is not null then
    for v_dm in select * from find_duplicates(v_name, null) loop
      if v_dm.reason = 'aynı firma adı' then
        if v_dm.entity_type = 'customer' then v_cust_id := v_dm.id; v_esleme_notu := '[Eşleştirme: aynı isim, FARKLI telefon — kontrol edin]'; exit;
        elsif v_dm.entity_type = 'lead' and v_lead_id is null then v_lead_id := v_dm.id; v_esleme_notu := '[Eşleştirme: aynı isim, FARKLI telefon — kontrol edin]'; end if;
      elsif v_dm.reason like '%benzer%' and v_benzer_notu is null then
        -- 1c) Benzer isim: bağlama, yalnız not
        v_benzer_notu := '[Olası aynı müşteri: ' || coalesce(v_dm.title,'') || case when v_dm.code is not null then ' (' || v_dm.code || ')' else '' end || ']';
      end if;
    end loop;
    if v_cust_id is not null and v_phone is not null then
      insert into contact_points (entity_type, entity_id, type, value, is_primary)
      select 'customer', v_cust_id, 'phone', v_phone, false
      where not exists (select 1 from contact_points where entity_type='customer' and entity_id=v_cust_id and type in ('phone','whatsapp') and value_normalized = v_phone);
    end if;
  end if;
  if v_esleme_notu is not null or v_benzer_notu is not null then
    v_note := concat_ws(E'\n', v_note, v_esleme_notu, v_benzer_notu);
  end if;

  -- 2) Eşleşme yoksa yeni potansiyel (lead) → müşteriye çevir (kullanıcı kararı)
  if v_cust_id is null then
    if v_lead_id is null then
      if v_name is null and v_phone is null then
        return jsonb_build_object('ok',false,'error','contact_required');
      end if;
      insert into leads (status_id, company_name, full_name, city, source_id)
      values ((select id from lead_statuses where key='yeni'), v_name, v_name, v_city,
              (select id from lead_sources where key='web_sitesi'))
      returning id into v_lead_id;
      if v_phone is not null then insert into contact_points (entity_type, entity_id, type, value, is_primary) values ('lead', v_lead_id, 'phone', v_phone, true); end if;
      if v_email is not null then insert into contact_points (entity_type, entity_id, type, value, is_primary) values ('lead', v_lead_id, 'email', v_email, v_phone is null); end if;
    end if;
    v_cust_id := public.convert_lead_to_customer(v_lead_id, (select id from customer_types where key='yurtici'));
  end if;

  -- 3) İl (şehir adından, en iyi çaba)
  select id into v_prov_id from provinces where lower(name) = lower(v_city) limit 1;
  v_prod_source := case when v_mode = 'upload' then 'gorsel_yukleme' else 'katalogdan_secim' end;

  -- 4) Aynı müşterinin AÇIK talebi var mı? (E.4 birleştirme önerisi için)
  select o.id into v_open_op from operations o
    where o.customer_id = v_cust_id and o.deleted_at is null and o.merged_into is null
      and o.stage_id not in (select id from operation_stages where is_terminal)
    order by o.created_at limit 1;

  -- 5) Operasyon (TAS + SLA + havuz açık dosyası trigger'larda; sahipsiz)
  insert into operations (customer_id, source, channel_id, landing_source, product_source, description, province_id, client_reference, possible_merge_with, requested_at,
                          marketing, marketing_channel_id)
  values (v_cust_id, 'web_sitesi', (select id from request_channels where key='web_sitesi'),
          v_source, v_prod_source, v_note, v_prov_id, v_ref, v_open_op, now(),
          -- Pazarlama kaynağı (site kaynak-takip.js: kanal, utm_*, gclid/fbclid/ttclid, referrer) — ham JSON + tanınan kanal
          case when jsonb_typeof(p->'kaynak') = 'object' then p->'kaynak' else null end,
          (select id from marketing_channels where key = public.pazarlama_kanali_bul(p->'kaynak')))
  returning id, code into v_op_id, v_op_code;

  -- 6) Katalog kalemleri (koda göre eşleştir; eşleşmeyen nota)
  --    M1.4a: müşteri sitede gördüğü kodu (site_code, ör. ST-26SS300008) yazıyor;
  --    CRM iç kodu farklı olabiliyor (code, ör. YS-8ULK8Z). Bu yüzden eşleştirme
  --    HER İKİ kolona bakar ve çakışmada site_code'u önceler. Kaydedilen kod da
  --    müşteriye görünen koddur — yazışmada aynı kodu konuşalım.
  for v_prod in select value from jsonb_array_elements(v_products) loop
    declare v_cp record;
    begin
      -- 6a) BİREBİR eşleşme — davranış AYNEN korunur (madde 1: additif).
      select id, code, name, site_code into v_cp from catalog_products
        where deleted_at is null and trim(v_prod->>'code') in (code, site_code)
        order by (site_code = trim(v_prod->>'code')) desc limit 1;
      -- 6b) Birebir tutmazsa TEK tolerant deneme (madde 3): büyük/küçük harf +
      --     baş/son boşluk + Türkçe-güvenli. Ham upper()/lower() DEĞİL → normalize_tr.
      --     İç ayraç farkı (ST-26 vs ST26) burada eşleşmez; o yalnız ÖNERİ olur.
      if v_cp.id is null then
        select id, code, name, site_code into v_cp from catalog_products
          where deleted_at is null
            and public.normalize_tr(v_prod->>'code') in (public.normalize_tr(code), public.normalize_tr(site_code))
          order by (public.normalize_tr(site_code) = public.normalize_tr(v_prod->>'code')) desc
          limit 1;
      end if;
      if v_cp.id is not null then
        insert into operation_catalog_items (operation_id, catalog_product_id, catalog_product_code, label)
        values (v_op_id, v_cp.id, coalesce(v_cp.site_code, v_cp.code), coalesce(nullif(trim(v_prod->>'name'),''), v_cp.name));
        v_matched := v_matched + 1;
      else
        -- Eşleşmeyen: kalem olarak EKLENİR ama catalog_product_id NULL (kartta çözülür).
        insert into operation_catalog_items (operation_id, catalog_product_id, catalog_product_code, label)
        values (v_op_id, null, trim(v_prod->>'code'), nullif(trim(v_prod->>'name'),''));
        v_unmatched := v_unmatched || (v_prod->>'code') || ' ';
      end if;
    end;
  end loop;

  -- 7) Katalogdan seçimde taslak teklif (durum DEĞİŞMEZ)
  if v_prod_source = 'katalogdan_secim' and v_matched > 0 then
    v_draft := public.build_draft_quote(v_op_id);
  end if;

  return jsonb_build_object('ok',true,'code',v_op_code,'operation_id',v_op_id,'customer_id',v_cust_id,
    'possible_merge_with', v_open_op, 'matched_products', v_matched, 'unmatched', trim(v_unmatched),
    'draft_quote_document_id', v_draft, 'idempotent', false);
end $function$
;

-- metrics.metric_requests: by_marketing, by_product_source, by_dow eklendi
CREATE OR REPLACE FUNCTION metrics.metric_requests(p_from timestamp with time zone, p_to timestamp with time zone, p_scope_user uuid DEFAULT NULL::uuid, p_channel bigint DEFAULT NULL::bigint, p_category bigint DEFAULT NULL::bigint, p_province bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_pf timestamptz := p_from - (p_to - p_from); v_tz text := public.app_timezone(); r jsonb;
begin
  perform metrics.guard(p_scope_user);
  with base as materialized (
    select o.channel_id, o.category_id, o.province_id, o.sla_deadline, o.landing_source, o.marketing_channel_id, o.product_source,
           coalesce(o.requested_at, o.created_at) as req_at,
           (select min(q.created_at) from public.quotes q where q.operation_id=o.id and q.deleted_at is null) as first_quote_at
    from public.operations o
    where o.deleted_at is null and coalesce(o.requested_at,o.created_at) >= p_from and coalesce(o.requested_at,o.created_at) < p_to
      and (p_scope_user is null or o.owner_id = p_scope_user)
      and (p_channel is null or o.channel_id = p_channel)
      and (p_category is null or o.category_id = p_category or o.type_id = p_category)
      and (p_province is null or o.province_id = p_province)
  ),
  sla as (
    select
      count(*) filter (where sla_deadline is not null and first_quote_at is not null and first_quote_at <= sla_deadline) met,
      count(*) filter (where sla_deadline is not null and sla_deadline < now() and (first_quote_at is null or first_quote_at > sla_deadline)) missed,
      count(*) filter (where sla_deadline is not null and sla_deadline >= now() and (first_quote_at is null or first_quote_at > sla_deadline)) pending
    from base
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'prev_total', (select count(*) from public.operations o where o.deleted_at is null and coalesce(o.requested_at,o.created_at) >= v_pf and coalesce(o.requested_at,o.created_at) < p_from and (p_scope_user is null or o.owner_id=p_scope_user) and (p_channel is null or o.channel_id=p_channel) and (p_category is null or o.category_id=p_category or o.type_id=p_category) and (p_province is null or o.province_id=p_province)),
    'sla_met_count', (select met from sla),
    'sla_missed_count', (select missed from sla),
    'sla_pending_count', (select pending from sla),
    'sla_rate', (select case when (met+missed)=0 then null else round(100.0*met/(met+missed),1) end from sla),
    'avg_response_hours', (select round(avg(extract(epoch from (first_quote_at - req_at))/3600)::numeric,1) from base where first_quote_at is not null),
    'by_channel', (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(ch.label,'—'),'count',c) order by c desc),'[]') from (select channel_id,count(*) c from base group by 1) t left join public.request_channels ch on ch.id=t.channel_id),
    'by_category', (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(pc.label,'—'),'count',c) order by c desc),'[]') from (select category_id,count(*) c from base group by 1) t left join public.product_categories pc on pc.id=t.category_id),
    'by_city', (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(pv.name,'—'),'count',c) order by c desc),'[]') from (select province_id,count(*) c from base group by 1) t left join public.provinces pv on pv.id=t.province_id),
    'by_hour', (select coalesce(jsonb_agg(jsonb_build_object('hour',h,'count',c) order by h),'[]') from (select extract(hour from req_at at time zone v_tz)::int h,count(*) c from base group by 1) x),
    'by_marketing', (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(mc.label,'Bilinmiyor'),'key', coalesce(mc.key,'bilinmiyor'),'count',c) order by c desc),'[]') from (select marketing_channel_id,count(*) c from base group by 1) t left join public.marketing_channels mc on mc.id=t.marketing_channel_id),
    'by_product_source', (select coalesce(jsonb_agg(jsonb_build_object('label', case product_source when 'katalogdan_secim' then 'Katalogdan' when 'gorsel_yukleme' then 'Görsel / manuel ürün' else coalesce(product_source,'—') end,'count',c) order by c desc),'[]') from (select product_source,count(*) c from base group by 1) t),
    'by_dow', (select coalesce(jsonb_agg(jsonb_build_object('dow',d,'count',c) order by d),'[]') from (select extract(isodow from req_at at time zone v_tz)::int d,count(*) c from base group by 1) x),
    'by_landing', (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(landing_source,'—'),'count',c) order by c desc),'[]') from (select landing_source,count(*) c from base where landing_source is not null group by 1) x)
  ) into r;
  return r || jsonb_build_object('change_pct', metrics.pct((r->>'total')::numeric, (r->>'prev_total')::numeric));
end; $function$
;
