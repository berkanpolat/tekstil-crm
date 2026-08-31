-- =====================================================================
-- M3.1 — MESAJLAŞMA ŞEMASI (birleştirme programı, M3: teklead → CRM)
--
-- teklead'in WhatsApp erişim katmanı CRM'e taşınıyor. Canlı ölçüm (31 Ağu 2026):
-- 21.378 mesaj (17.980 giden / 3.370 gelen WhatsApp), 10.144 konuşma, 133 şablon.
-- E-posta 28 mesajda kalmış, SMS/Telegram hiç kullanılmamış — şema yine de kanal
-- bağımsız, çünkü kanal sözlüğü (interaction_channels) zaten hepsini tanıyor.
--
-- TASARIM KARARI (18 Ağu'da onaylanan kimlik modeli):
--   Mesajlaşma katmanı KENDİ KİMLİK TABLOSUNU TAŞIMAZ. teklead'de `contacts` vardı;
--   burada yok. Konuşma doğrudan `lead` ya da `customer`a bağlanır — CRM'in
--   `interactions`/`contact_points`/`entity_tags` tablolarındaki entity_type/entity_id
--   kalıbının aynısı. Böylece bir kişi lead'ken başlayan konuşma, müşteriye
--   dönüştüğünde kopmaz (convert_lead_to_customer konuşmayı taşır — M3.3).
--
-- `interactions` ile FARKI: interactions insanın elle kaydettiği temas günlüğüdür
-- (özet metin). `messages` gerçek mesaj gövdesini, teslim durumunu, medyayı ve
-- sağlayıcı kimliğini tutar. İkisi ayrı amaçlar; birleştirilmedi.
--
-- Bu paket YALNIZCA şema. Veri göçü M3.2 (kişiler) ve M3.3 (mesaj geçmişi).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Yetkiler
-- ---------------------------------------------------------------------
insert into public.permissions (key, module, action, description) values
  ('messages.view',    'messages',  'view',   'Konuşmaları ve mesajları görüntüle'),
  ('messages.send',    'messages',  'send',   'Mesaj gönder'),
  ('templates.manage', 'templates', 'manage', 'Mesaj şablonlarını yönet')
on conflict (key) do nothing;

-- Görüntüleme + gönderim: satış yapan roller. Şablon yönetimi: yönetici roller.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on true
where (r.key in ('admin','manager','sales') and p.key in ('messages.view','messages.send'))
   or (r.key in ('admin','manager')          and p.key = 'templates.manage')
   or (r.key in ('operations','finance')     and p.key = 'messages.view')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2) Şablonlar
-- ---------------------------------------------------------------------
create table public.message_templates (
  id                  bigint generated always as identity primary key,
  key                 text not null unique,           -- makine adı (twilio content sid eşlemesi)
  name                text not null,                  -- iç ad
  display_name        text,                           -- listede görünen ad
  group_name          text,                           -- gruplama (ör. "İlk Temas")
  channel_id          bigint references public.interaction_channels(id) on delete restrict,
  body                text not null,                  -- {{1}} {{2}} yer tutuculu gövde
  is_followup         boolean not null default false,
  ai_generated        boolean not null default false,
  ai_prompt           text,
  -- Sağlayıcı onayı (WhatsApp şablonları Meta onayından geçer)
  approval_status     text not null default 'taslak'
                      check (approval_status in ('taslak','gonderildi','onaylandi','reddedildi')),
  approval_external_id text,
  approved_at         timestamptz,
  submitted_at        timestamptz,
  rejected_at         timestamptz,
  rejection_reason    text,
  is_active           boolean not null default true,
  external_source     text,
  external_id         text,
  created_by          uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index message_templates_external_uidx
  on public.message_templates (external_source, external_id)
  where external_source is not null and external_id is not null;
comment on table public.message_templates is
  'Mesaj şablonları. WhatsApp şablonları sağlayıcı onayından geçer; approval_status onu izler.';

create table public.message_template_variables (
  id            bigint generated always as identity primary key,
  template_id   bigint not null references public.message_templates(id) on delete cascade,
  position      int not null,                  -- {{1}} → 1
  name          text not null,
  description   text,
  source        text not null default 'manuel' -- değer nereden gelir
                check (source in ('manuel','lead','customer','sabit')),
  source_field  text,                          -- source='lead' ise ör. 'full_name'
  default_value text,
  external_name text,
  unique (template_id, position)
);

-- ---------------------------------------------------------------------
-- 3) Konuşmalar — kimlik taşımaz, lead/customer'a bağlanır
-- ---------------------------------------------------------------------
create table public.conversations (
  id              bigint generated always as identity primary key,
  entity_type     text   not null check (entity_type in ('lead','customer')),
  entity_id       bigint not null,
  channel_id      bigint not null references public.interaction_channels(id) on delete restrict,
  -- Karşı tarafın kanal kimliği (telefon/e-posta). contact_points'teki değerin aynısı;
  -- burada da tutulur ki gelen mesaj kişi bulunamasa bile konuşmaya düşebilsin.
  peer_identifier text,
  last_message_at timestamptz,
  unread_count    int not null default 0 check (unread_count >= 0),
  is_archived     boolean not null default false,
  external_source text,
  external_id     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index conversations_entity_idx   on public.conversations (entity_type, entity_id);
create index conversations_recent_idx   on public.conversations (last_message_at desc nulls last);
create index conversations_unread_idx   on public.conversations (unread_count) where unread_count > 0;
create unique index conversations_external_uidx
  on public.conversations (external_source, external_id)
  where external_source is not null and external_id is not null;
-- Bir kişiyle bir kanalda tek açık konuşma olur (gelen mesaj hangi konuşmaya
-- düşeceğini bilsin diye). Arşivlenmişler bu kısıtın dışında.
create unique index conversations_tekil_acik_uidx
  on public.conversations (entity_type, entity_id, channel_id)
  where not is_archived;

comment on column public.conversations.entity_type is
  'lead | customer — mesajlaşma kendi kimlik tablosunu taşımaz (bkz. M3.1 başlığı).';

-- ---------------------------------------------------------------------
-- 4) Mesajlar
-- ---------------------------------------------------------------------
create table public.messages (
  id                bigint generated always as identity primary key,
  conversation_id   bigint not null references public.conversations(id) on delete cascade,
  direction         text not null check (direction in ('inbound','outbound')),
  status            text not null default 'kuyrukta'
                    check (status in ('kuyrukta','gonderildi','iletildi','okundu','basarisiz','alindi')),
  body              text,
  rendered_body     text,                         -- şablon değişkenleri yerleştirilmiş hali
  template_id       bigint references public.message_templates(id) on delete set null,
  template_variables jsonb,
  -- Sağlayıcı izi (Twilio/Postmark) — webhook durum güncellemesi bunun üzerinden bulur
  provider          text,
  provider_message_id text,
  provider_response jsonb,
  error_code        text,
  error_message     text,
  -- Medya
  media_url         text,
  media_type        text,
  media_name        text,
  media_size_bytes  bigint,
  external_source   text,
  external_id       text,
  sent_by           uuid references auth.users(id),
  sent_at           timestamptz,
  delivered_at      timestamptz,
  read_at           timestamptz,
  failed_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at desc);
create index messages_provider_idx     on public.messages (provider, provider_message_id)
  where provider_message_id is not null;
create unique index messages_external_uidx
  on public.messages (external_source, external_id)
  where external_source is not null and external_id is not null;

-- ---------------------------------------------------------------------
-- 5) last_message_at / unread_count otomatik güncellensin
--    (uygulama unutursa gelen kutusu yanlış sıralanır)
-- ---------------------------------------------------------------------
create or replace function public.conversations_touch_from_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations
     set last_message_at = greatest(coalesce(last_message_at, new.created_at), new.created_at),
         unread_count = case when new.direction = 'inbound' then unread_count + 1 else unread_count end,
         updated_at = now()
   where id = new.conversation_id;
  return new;
end $$;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.conversations_touch_from_message();

create trigger message_templates_touch before update on public.message_templates
  for each row execute function public.touch_updated_at();
create trigger conversations_touch before update on public.conversations
  for each row execute function public.touch_updated_at();
create trigger messages_touch before update on public.messages
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 6) RLS — okuma messages.view, yazma messages.send / templates.manage
-- ---------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.message_templates enable row level security;
alter table public.message_template_variables enable row level security;

create policy conversations_select on public.conversations for select to authenticated using (public.has_permission('messages.view'));
create policy conversations_write  on public.conversations for all    to authenticated using (public.has_permission('messages.send')) with check (public.has_permission('messages.send'));
create policy messages_select      on public.messages      for select to authenticated using (public.has_permission('messages.view'));
create policy messages_write       on public.messages      for all    to authenticated using (public.has_permission('messages.send')) with check (public.has_permission('messages.send'));
create policy templates_select     on public.message_templates for select to authenticated using (public.has_permission('messages.view'));
create policy templates_write      on public.message_templates for all    to authenticated using (public.has_permission('templates.manage')) with check (public.has_permission('templates.manage'));
create policy template_vars_select on public.message_template_variables for select to authenticated using (public.has_permission('messages.view'));
create policy template_vars_write  on public.message_template_variables for all    to authenticated using (public.has_permission('templates.manage')) with check (public.has_permission('templates.manage'));

do $$ declare t text;
begin
  foreach t in array array['conversations','messages','message_templates','message_template_variables'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('revoke all on public.%I from anon;', t);
  end loop;
end $$;
