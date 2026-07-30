-- =====================================================================
-- P3.1 — Operasyon referans listeleri (hepsi ayarlardan yönetilir, P1.1 kalıbı).
-- Ortak: id, key(unique), label, sort_order, color, is_default, is_active,
-- is_system + (durum tablolarında is_closed) + ts. Triggerlar: touch,
-- guard_system, no_delete, audit. RLS: okuma aktif kullanıcı, yazma owner/admin.
-- =====================================================================

-- Aşama listesi (boru hattı) — koda gömülü DEĞİL; sıra/renk buradan render edilir.
-- is_terminal: tamamlandı/iptal (bitiş aşamaları). Faz 4/5'te yeni aşama = ayar, migration değil.
create table public.operation_stages (
  id bigint generated always as identity primary key,
  key text not null unique, label text not null, sort_order int not null default 0,
  color text, is_default boolean not null default false, is_terminal boolean not null default false,
  is_active boolean not null default true, is_system boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.operation_stages (key,label,sort_order,color,is_default,is_terminal,is_system) values
  ('talep','Talep',1,'info',true,false,true),
  ('teklif','Teklif',2,'info',false,false,true),
  ('numune','Numune',3,'warning',false,false,true),
  ('siparis','Sipariş',4,'info',false,false,true),
  ('uretim','Üretim',5,'info',false,false,true),
  ('teslimat','Teslimat',6,'info',false,false,true),
  ('tamamlandi','Tamamlandı',7,'success',false,true,true),
  ('iptal','İptal',8,'danger',false,true,true);
create unique index operation_stages_single_default on public.operation_stages (is_default) where is_default;

-- Durum tabloları (is_closed + is_default)
create table public.request_statuses (
  id bigint generated always as identity primary key,
  key text not null unique, label text not null, sort_order int not null default 0,
  color text, is_default boolean not null default false, is_closed boolean not null default false,
  is_active boolean not null default true, is_system boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.request_statuses (key,label,sort_order,color,is_default,is_closed,is_system) values
  ('yeni_olusturuldu','Yeni Oluşturuldu',1,'info',true,false,true),
  ('inceleniyor','İnceleniyor',2,'info',false,false,true),
  ('ek_bilgi_bekleniyor','Ek Bilgi Bekleniyor',3,'warning',false,false,true),
  ('maliyet_hesaplaniyor','Maliyet Hesaplanıyor',4,'info',false,false,true),
  ('teklif_hazirlaniyor','Teklif Hazırlanıyor',5,'info',false,false,true),
  ('teklife_aktarildi','Teklife Aktarıldı',6,'success',false,false,true),
  ('beklemede','Beklemede',7,'neutral',false,false,true),
  ('iptal_edildi','İptal Edildi',8,'danger',false,true,true);

create table public.quote_statuses (
  id bigint generated always as identity primary key,
  key text not null unique, label text not null, sort_order int not null default 0,
  color text, is_default boolean not null default false, is_closed boolean not null default false,
  is_active boolean not null default true, is_system boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.quote_statuses (key,label,sort_order,color,is_default,is_closed,is_system) values
  ('hazirlaniyor','Hazırlanıyor',1,'info',true,false,true),
  ('incelemede','İncelemede',2,'info',false,false,true),
  ('gonderilmeye_hazir','Gönderilmeye Hazır',3,'info',false,false,true),
  ('gonderildi','Gönderildi',4,'info',false,false,true),
  ('musteri_inceliyor','Müşteri İnceliyor',5,'warning',false,false,true),
  ('revize_bekleniyor','Revize Bekleniyor',6,'warning',false,false,true),
  ('kabul_edildi','Kabul Edildi',7,'success',false,true,true),
  ('reddedildi','Reddedildi',8,'danger',false,true,true),
  ('suresi_doldu','Süresi Doldu',9,'neutral',false,false,true),
  ('iptal_edildi','İptal Edildi',10,'danger',false,true,true);

create table public.sample_statuses (
  id bigint generated always as identity primary key,
  key text not null unique, label text not null, sort_order int not null default 0,
  color text, is_default boolean not null default false, is_closed boolean not null default false,
  is_active boolean not null default true, is_system boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.sample_statuses (key,label,sort_order,color,is_default,is_closed,is_system) values
  ('hazirlaniyor','Hazırlanıyor',1,'info',true,false,true),
  ('uretimde','Üretimde',2,'info',false,false,true),
  ('kalite_kontrolunde','Kalite Kontrolünde',3,'info',false,false,true),
  ('musteriye_gonderildi','Müşteriye Gönderildi',4,'info',false,false,true),
  ('inceleniyor','İnceleniyor',5,'warning',false,false,true),
  ('revize_bekleniyor','Revize Bekleniyor',6,'warning',false,false,true),
  ('onaylandi','Onaylandı',7,'success',false,true,true),
  ('reddedildi','Reddedildi',8,'danger',false,true,true),
  ('yeniden_uretilecek','Yeniden Üretilecek',9,'warning',false,false,true),
  ('iptal_edildi','İptal Edildi',10,'danger',false,true,true);

create table public.order_statuses (
  id bigint generated always as identity primary key,
  key text not null unique, label text not null, sort_order int not null default 0,
  color text, is_default boolean not null default false, is_closed boolean not null default false,
  is_active boolean not null default true, is_system boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.order_statuses (key,label,sort_order,color,is_default,is_closed,is_system) values
  ('olusturuldu','Oluşturuldu',1,'info',true,false,true),
  ('planlaniyor','Planlanıyor',2,'info',false,false,true),
  ('uretime_hazir','Üretime Hazır',3,'info',false,false,true),
  ('uretimde','Üretimde',4,'info',false,false,true),
  ('kalite_kontrolde','Kalite Kontrolde',5,'info',false,false,true),
  ('paketleniyor','Paketleniyor',6,'info',false,false,true),
  ('sevkiyata_hazir','Sevkiyata Hazır',7,'info',false,false,true),
  ('sevk_edildi','Sevk Edildi',8,'success',false,false,true),
  ('tamamlandi','Tamamlandı',9,'success',false,true,true),
  ('askiya_alindi','Askıya Alındı',10,'warning',false,false,true),
  ('iptal_edildi','İptal Edildi',11,'danger',false,true,true);

-- Öncelikler + gerekçe/red listeleri + ödeme koşulları (is_closed yok)
create table public.priorities (
  id bigint generated always as identity primary key,
  key text not null unique, label text not null, sort_order int not null default 0,
  color text, is_default boolean not null default false,
  is_active boolean not null default true, is_system boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.priorities (key,label,sort_order,color,is_default,is_system) values
  ('dusuk','Düşük',1,'neutral',false,true),
  ('normal','Normal',2,'info',true,true),
  ('yuksek','Yüksek',3,'warning',false,true),
  ('acil','Acil',4,'danger',false,true);

create table public.cancellation_reasons (
  id bigint generated always as identity primary key,
  key text not null unique, label text not null, sort_order int not null default 0,
  color text, is_active boolean not null default true, is_system boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.cancellation_reasons (key,label,sort_order,is_system) values
  ('musteri_vazgecti','Müşteri Vazgeçti',1,true),
  ('bilgi_eksikligi','Bilgi Eksikliği',2,true),
  ('ticari_anlasma_saglanamadi','Ticari Anlaşma Sağlanamadı',3,true),
  ('teknik_uygunluk_yok','Teknik Uygunluk Yok',4,true),
  ('diger','Diğer',5,true);

create table public.quote_rejection_reasons (
  id bigint generated always as identity primary key,
  key text not null unique, label text not null, sort_order int not null default 0,
  color text, is_active boolean not null default true, is_system boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.quote_rejection_reasons (key,label,sort_order,is_system) values
  ('fiyat_yuksek','Fiyat Yüksek',1,true),
  ('termin_uygun_degil','Termin Uygun Değil',2,true),
  ('rakip_tercih_edildi','Rakip Tercih Edildi',3,true),
  ('musteri_vazgecti','Müşteri Vazgeçti',4,true),
  ('ulasilamadi','Ulaşılamadı',5,true),
  ('diger','Diğer',6,true);

create table public.payment_terms (
  id bigint generated always as identity primary key,
  key text not null unique, label text not null, sort_order int not null default 0,
  color text, is_default boolean not null default false,
  is_active boolean not null default true, is_system boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.payment_terms (key,label,sort_order,is_default,is_system) values
  ('yuzde_50_50','%50 Peşin / %50 Teslimat',1,true,true),
  ('pesin','Peşin',2,false,true),
  ('vadeli_30','30 Gün Vadeli',3,false,true),
  ('diger','Diğer',4,false,true);

-- Tek varsayılan (kısmi unique) — durum/öncelik/ödeme tabloları
create unique index request_statuses_single_default on public.request_statuses (is_default) where is_default;
create unique index quote_statuses_single_default on public.quote_statuses (is_default) where is_default;
create unique index sample_statuses_single_default on public.sample_statuses (is_default) where is_default;
create unique index order_statuses_single_default on public.order_statuses (is_default) where is_default;
create unique index priorities_single_default on public.priorities (is_default) where is_default;
create unique index payment_terms_single_default on public.payment_terms (is_default) where is_default;

-- Standart tanım-tablosu trigger'ları + RLS (P1.1 helper fonksiyonları)
do $$
declare t text; ref_tables text[] := array[
  'operation_stages','request_statuses','quote_statuses','sample_statuses','order_statuses',
  'priorities','cancellation_reasons','quote_rejection_reasons','payment_terms'];
begin
  foreach t in array ref_tables loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at();', t, t);
    execute format('create trigger %I_guard_system before update on public.%I for each row execute function public.guard_system_reference();', t, t);
    execute format('create trigger %I_no_delete before delete on public.%I for each row execute function public.prevent_reference_delete();', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_trigger();', t, t);
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %I_select on public.%I for select to authenticated using (public.is_active_user());', t, t);
    execute format('create policy %I_write on public.%I for all to authenticated using (public.is_admin_or_owner()) with check (public.is_admin_or_owner());', t, t);
    execute format('revoke all on public.%I from anon;', t);
    execute format('grant select, insert, update on public.%I to authenticated;', t);
  end loop;
end $$;

-- codes.operation_prefix operasyon entity'si için artık MEŞRU (Faz 1'de tekleştirme
-- sırasında kullanım dışı işaretlenmişti) → geri aç.
update public.settings
  set is_deprecated = false,
      description = 'Operasyon kodu öneki (TAS-XXXXXX). generate_operation_code(''operation'',...) bunu okur.'
  where key = 'codes.operation_prefix';
