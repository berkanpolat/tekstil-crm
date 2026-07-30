-- =====================================================================
-- Faz 3 yeniden yapılandırma (Merhaba.docx Bölüm 3-6). baslangıc.docx ile
-- çelişen her yerde Merhaba.docx geçerli. Detaylı durum listeleri sadeleşiyor.
--   1) Durum modeli: 8 → 2 (teklif_bekliyor varsayılan / teklif_iletildi).
--      teklif_iletildi'ye ELLE geçilemez; yalnızca teklif dosyası yüklenince otomatik.
--   2) Aşamalar: "talep" kalkar → ilk aşama "Teklif Bekliyor".
--   3) Öncelik tablosu + alanı tamamen kalkar.
--   4) Yeni alanlar: kanal, il (province) + ilçe (serbest, normalize), ürün geliş türü.
--   5) operation_catalog_items (katalog seçimi; kod metin, Faz 4'te FK).
--   6) quotes.quote_file_id / orders.order_file_id + extracted_data (dosya-yükleme akışı).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) request_statuses → 2 durum
-- ---------------------------------------------------------------------
update public.request_statuses set is_default = false where is_default;
insert into public.request_statuses (key, label, sort_order, color, is_default, is_closed, is_system) values
  ('teklif_bekliyor', 'Teklif Bekliyor', 1, 'warning', true, false, true),
  ('teklif_iletildi', 'Teklif İletildi', 2, 'info', false, false, true)
on conflict (key) do update set label = excluded.label, sort_order = excluded.sort_order,
  color = excluded.color, is_default = excluded.is_default, is_active = true;
update public.request_statuses set is_active = false where key not in ('teklif_bekliyor', 'teklif_iletildi');

-- ---------------------------------------------------------------------
-- 2) operation_stages → talep kalkar, teklif_bekliyor/teklif_iletildi gelir
-- ---------------------------------------------------------------------
update public.operation_stages set is_default = false where is_default;
insert into public.operation_stages (key, label, sort_order, color, is_default, is_terminal, is_system) values
  ('teklif_bekliyor', 'Teklif Bekliyor', 1, 'warning', true, false, true),
  ('teklif_iletildi', 'Teklif İletildi', 2, 'info', false, false, true)
on conflict (key) do update set label = excluded.label, sort_order = excluded.sort_order,
  color = excluded.color, is_default = excluded.is_default, is_active = true;
update public.operation_stages set sort_order = 3 where key = 'numune';
update public.operation_stages set sort_order = 4 where key = 'siparis';
update public.operation_stages set sort_order = 5 where key = 'uretim';
update public.operation_stages set sort_order = 6 where key = 'teslimat';
update public.operation_stages set sort_order = 7 where key = 'tamamlandi';
update public.operation_stages set sort_order = 8 where key = 'iptal';
update public.operation_stages set is_active = false where key in ('talep', 'teklif');

-- Mevcut operasyonları yeni aşama/duruma taşı
update public.operations set stage_id = (select id from public.operation_stages where key = 'teklif_bekliyor')
  where stage_id in (select id from public.operation_stages where key = 'talep');
update public.operations set stage_id = (select id from public.operation_stages where key = 'teklif_iletildi')
  where stage_id in (select id from public.operation_stages where key = 'teklif');
update public.operations set request_status_id = (select id from public.request_statuses where key = 'teklif_bekliyor');

-- status_transitions güncel akış
delete from public.status_transitions where entity_type = 'operation';
insert into public.status_transitions (entity_type, from_key, to_key, is_system, sort_order) values
  ('operation','teklif_bekliyor','teklif_iletildi',true,1),
  ('operation','teklif_iletildi','numune',true,2),
  ('operation','teklif_iletildi','siparis',true,3),
  ('operation','numune','siparis',true,4),
  ('operation','siparis','uretim',true,5),
  ('operation','uretim','teslimat',true,6),
  ('operation','teslimat','tamamlandi',true,7),
  ('operation','*','iptal',true,99);

-- ---------------------------------------------------------------------
-- 3) Öncelik tamamen kalkar
-- ---------------------------------------------------------------------
alter table public.operations drop column if exists priority_id;
drop table if exists public.priorities cascade;

-- BEFORE INSERT güncelle: öncelik atama satırı çıkar
create or replace function public.operations_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_cat text; v_type text;
begin
  if new.code is null then new.code := public.generate_operation_code('operation', new.id::text); end if;
  if new.stage_id is null then select id into new.stage_id from public.operation_stages where is_default limit 1; end if;
  if new.request_status_id is null then select id into new.request_status_id from public.request_statuses where is_default limit 1; end if;
  if new.title is null or btrim(new.title) = '' then
    select label into v_cat from public.product_categories where id = new.category_id;
    select label into v_type from public.product_categories where id = new.type_id;
    new.title := btrim(concat_ws(' ', v_cat, v_type));
    if new.title = '' then new.title := 'Talep'; end if;
    new.title := new.title || ' — ' || to_char((coalesce(new.requested_at, now()) at time zone public.app_timezone())::date, 'DD.MM.YYYY');
  end if;
  return new;
end; $$;

-- ---------------------------------------------------------------------
-- 4) Kanal referansı + İl + İlçe + Ürün geliş türü
-- ---------------------------------------------------------------------
create table public.request_channels (
  id bigint generated always as identity primary key,
  key text not null unique, label text not null, sort_order int not null default 0,
  color text, is_default boolean not null default false,
  is_active boolean not null default true, is_system boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
comment on table public.request_channels is 'Talep geliş kanalı (rapor: kanal ağırlıkları). Ayarlardan yönetilir.';
insert into public.request_channels (key, label, sort_order, color, is_default, is_system) values
  ('whatsapp','WhatsApp',1,'success',false,true), ('web_sitesi','Web Sitesi',2,'info',true,true),
  ('mail','E-posta',3,'info',false,true), ('instagram','Instagram',4,'danger',false,true),
  ('telegram','Telegram',5,'info',false,true), ('telefon','Telefon',6,'neutral',false,true),
  ('manuel','Manuel',7,'neutral',false,true);

create table public.provinces (
  id bigint generated always as identity primary key,
  plate_code int not null unique, name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
comment on table public.provinces is 'Türkiye illeri (81). İlçe şimdilik serbest metin; TekLead tr_il_bolge içe aktarımı bekliyor (docs/specs).';
insert into public.provinces (plate_code, name) values
 (1,'Adana'),(2,'Adıyaman'),(3,'Afyonkarahisar'),(4,'Ağrı'),(5,'Amasya'),(6,'Ankara'),(7,'Antalya'),(8,'Artvin'),
 (9,'Aydın'),(10,'Balıkesir'),(11,'Bilecik'),(12,'Bingöl'),(13,'Bitlis'),(14,'Bolu'),(15,'Burdur'),(16,'Bursa'),
 (17,'Çanakkale'),(18,'Çankırı'),(19,'Çorum'),(20,'Denizli'),(21,'Diyarbakır'),(22,'Edirne'),(23,'Elazığ'),(24,'Erzincan'),
 (25,'Erzurum'),(26,'Eskişehir'),(27,'Gaziantep'),(28,'Giresun'),(29,'Gümüşhane'),(30,'Hakkâri'),(31,'Hatay'),(32,'Isparta'),
 (33,'Mersin'),(34,'İstanbul'),(35,'İzmir'),(36,'Kars'),(37,'Kastamonu'),(38,'Kayseri'),(39,'Kırklareli'),(40,'Kırşehir'),
 (41,'Kocaeli'),(42,'Konya'),(43,'Kütahya'),(44,'Malatya'),(45,'Manisa'),(46,'Kahramanmaraş'),(47,'Mardin'),(48,'Muğla'),
 (49,'Muş'),(50,'Nevşehir'),(51,'Niğde'),(52,'Ordu'),(53,'Rize'),(54,'Sakarya'),(55,'Samsun'),(56,'Siirt'),
 (57,'Sinop'),(58,'Sivas'),(59,'Tekirdağ'),(60,'Tokat'),(61,'Trabzon'),(62,'Tunceli'),(63,'Şanlıurfa'),(64,'Uşak'),
 (65,'Van'),(66,'Yozgat'),(67,'Zonguldak'),(68,'Aksaray'),(69,'Bayburt'),(70,'Karaman'),(71,'Kırıkkale'),(72,'Batman'),
 (73,'Şırnak'),(74,'Bartın'),(75,'Ardahan'),(76,'Iğdır'),(77,'Yalova'),(78,'Karabük'),(79,'Kilis'),(80,'Osmaniye'),(81,'Düzce');

alter table public.provinces enable row level security;
create policy provinces_select on public.provinces for select to authenticated using (public.is_active_user());
create policy provinces_write on public.provinces for all to authenticated using (public.is_admin_or_owner()) with check (public.is_admin_or_owner());
revoke all on public.provinces from anon;
grant select, insert, update on public.provinces to authenticated;

-- request_channels standart referans trigger/RLS
create trigger request_channels_touch before update on public.request_channels for each row execute function public.touch_updated_at();
create trigger request_channels_guard_system before update on public.request_channels for each row execute function public.guard_system_reference();
create trigger request_channels_no_delete before delete on public.request_channels for each row execute function public.prevent_reference_delete();
create trigger request_channels_audit after insert or update or delete on public.request_channels for each row execute function public.audit_trigger();
alter table public.request_channels enable row level security;
create policy request_channels_select on public.request_channels for select to authenticated using (public.is_active_user());
create policy request_channels_write on public.request_channels for all to authenticated using (public.is_admin_or_owner()) with check (public.is_admin_or_owner());
revoke all on public.request_channels from anon;
grant select, insert, update on public.request_channels to authenticated;
create trigger provinces_touch before update on public.provinces for each row execute function public.touch_updated_at();

-- operations yeni alanlar
alter table public.operations add column channel_id bigint references public.request_channels (id) on delete set null;
alter table public.operations add column province_id bigint references public.provinces (id) on delete set null;
alter table public.operations add column district text;
alter table public.operations add column district_normalized text generated always as (public.normalize_tr(district)) stored;
alter table public.operations add column product_source text check (product_source is null or product_source in ('gorsel_yukleme','katalogdan_secim'));
create index operations_channel_idx on public.operations (channel_id) where deleted_at is null;
create index operations_province_idx on public.operations (province_id) where deleted_at is null;
comment on column public.operations.district is 'İlçe (serbest metin, normalize). İleride TekLead tr_il_bolge ile bağlı seçiciye dönecek.';

-- ---------------------------------------------------------------------
-- 5) operation_catalog_items (katalog seçimi; ürün kodu metin, Faz 4'te FK)
-- ---------------------------------------------------------------------
create table public.operation_catalog_items (
  id bigint generated always as identity primary key,
  operation_id bigint not null references public.operations (id) on delete cascade,
  catalog_product_code text not null,
  label text,
  sort_order int not null default 0,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
comment on table public.operation_catalog_items is 'Talepte katalogdan seçilen ürünler (kod metin; Faz 4''te katalog FK). Kartta yatay kartlar.';
create index operation_catalog_items_op_idx on public.operation_catalog_items (operation_id);
create trigger operation_catalog_items_touch before update on public.operation_catalog_items for each row execute function public.touch_updated_at();
create trigger operation_catalog_items_audit after insert or update or delete on public.operation_catalog_items for each row execute function public.audit_trigger();
alter table public.operation_catalog_items enable row level security;
create policy operation_catalog_items_select on public.operation_catalog_items for select to authenticated using (public.is_active_user());
create policy operation_catalog_items_write on public.operation_catalog_items for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
revoke all on public.operation_catalog_items from anon;
grant select, insert, update, delete on public.operation_catalog_items to authenticated;

-- ---------------------------------------------------------------------
-- 6) Teklif & Sipariş: dosya-yükleme akışı
-- ---------------------------------------------------------------------
alter table public.quotes add column quote_file_id bigint references public.files (id) on delete set null;
alter table public.orders add column order_file_id bigint references public.files (id) on delete set null;
alter table public.orders add column extracted_data jsonb;
alter table public.orders add column extraction_source text not null default 'manuel' check (extraction_source in ('manuel','ai'));
comment on column public.orders.extracted_data is 'Sipariş formundan çekilen alanlar (adet/fiyat/renk/teslimat/ödeme). Faz 6 AI için hazır; kaynak extraction_source.';

-- teklif_iletildi'ye ELLE geçiş engellenir (yalnızca teklif dosyası varken).
create or replace function public.operations_teklif_gate()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_new_key text; v_has boolean;
begin
  select key into v_new_key from public.request_statuses where id = new.request_status_id;
  if v_new_key = 'teklif_iletildi' and (old.request_status_id is distinct from new.request_status_id) then
    select exists(select 1 from public.quotes where operation_id = new.id and deleted_at is null and quote_file_id is not null) into v_has;
    if not v_has then
      raise exception 'Teklif İletildi durumuna elle geçilemez; önce teklif dosyası yükleyin.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end; $$;
create trigger operations_teklif_gate before update on public.operations for each row execute function public.operations_teklif_gate();

-- Teklif dosyası varlığına göre operasyon durumunu senkronla (yükle→iletildi, sil→bekliyor).
create or replace function public.quotes_sync_operation_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_opid bigint := coalesce(new.operation_id, old.operation_id); v_has boolean;
begin
  select exists(select 1 from public.quotes where operation_id = v_opid and deleted_at is null and quote_file_id is not null) into v_has;
  update public.operations
    set request_status_id = (select id from public.request_statuses where key = case when v_has then 'teklif_iletildi' else 'teklif_bekliyor' end)
    where id = v_opid and cancelled_at is null;
  if v_has then
    update public.operations set stage_id = (select id from public.operation_stages where key = 'teklif_iletildi')
      where id = v_opid and stage_id = (select id from public.operation_stages where key = 'teklif_bekliyor');
  end if;
  return null;
end; $$;
create trigger quotes_sync_status after insert or update or delete on public.quotes
  for each row execute function public.quotes_sync_operation_status();
-- Not: mevcut seed tekliflerinde dosya yok → hepsi teklif_bekliyor kalır (doğru).
-- teklif_iletildi yalnızca gerçek teklif dosyası yüklenince oluşur.
