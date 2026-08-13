-- =====================================================================
-- DÜZELTME 2 — "Teklif Reddedildi" terminal aşaması
-- Reddedilen teklifler artık "İptal" ile karışmaz; ayrı terminal aşamada.
-- KAPSAM: yalnız Süreç Takip aktarımından gelen (legacy_code dolu) 155 iptal.
-- Aktarım dışı gerçek iptaller (legacy_code null) DOKUNULMAZ.
--
-- Sıra kritiktir:
--   1) yeni aşama + geçiş kuralı
--   2) quote-red trigger'ını yeni aşamaya YÖNLENDİR (bugünden sonrası için)
--   3) 155 operasyonu iptal → teklif_reddedildi
--   4) 155 quote → reddedildi (+gerekçe, responded_at = cancelled_at)  [5'ten ÖNCE okunur]
--   5) iptal alanlarını temizle (artık iptal değil)
-- Gürültü trigger'ları (bildirim/dosya-bandı/aşama-olayı) yalnız 4-5 boyunca kapatılır.
-- =====================================================================

begin;

-- 1) Yeni terminal aşama (danger), iptal'den ÖNCE sırala (tamamlandi=7 < 8 < iptal=9).
update public.operation_stages set sort_order = 9 where key = 'iptal';
insert into public.operation_stages (key, label, sort_order, color, is_default, is_terminal, is_active, is_system)
values ('teklif_reddedildi', 'Teklif Reddedildi', 8, 'danger', false, true, true, true)
on conflict (key) do nothing;

-- Geçiş kuralı: herhangi aşamadan → teklif_reddedildi (UI/state-machine seçenek görsün; gerekçe ister).
insert into public.status_transitions (entity_type, from_key, to_key, requires_reason, is_active, is_system, sort_order)
select 'operation', '*', 'teklif_reddedildi', true, true, true, 98
where not exists (
  select 1 from public.status_transitions
  where entity_type = 'operation' and from_key = '*' and to_key = 'teklif_reddedildi'
);

-- 2) Quote reddi tetikleyicisini YENİ aşamaya yönlendir (yalnız gövde; trigger tanımı aynı).
--    Bugünden sonra reddedilen gerçek teklifler de 'iptal' yerine 'teklif_reddedildi'ye gider.
create or replace function public.quotes_close_op_on_reject()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_new text; v_open int;
begin
  if new.status_id is distinct from old.status_id then
    select key into v_new from public.quote_statuses where id = new.status_id;
    if v_new in ('reddedildi','olumsuz') then
      select count(*) into v_open
        from public.quotes q left join public.quote_statuses s on s.id = q.status_id
        where q.operation_id = new.operation_id and q.deleted_at is null and q.id <> new.id
          and coalesce(s.key,'') not in ('reddedildi','olumsuz','iptal_edildi','suresi_doldu');
      if v_open = 0 then
        perform public.op_set_stage(new.operation_id, 'teklif_reddedildi');  -- eski: 'iptal'
      end if;
    end if;
  end if;
  return null;
end; $$;

-- Adım 3-5 için trigger'ları SESSION-LOCAL kapat (SET LOCAL = yalnız bu transaction,
-- commit'te otomatik geri döner, diğer bağlantıları HİÇ etkilemez, global katalog
-- değişikliği/ACCESS EXCLUSIVE kilit YOK). Amaç: 155 kayıt için bildirim/dosya-bandı/
-- bugün-tarihli aşama-olayı üretilmesin. CHECK/NOT NULL kısıtları yine geçerli.
set local session_replication_role = 'replica';

-- 3) 155 ithal iptal operasyonu → teklif_reddedildi (aktarım dışı iptaller korunur).
update public.operations o
set stage_id = (select id from public.operation_stages where key = 'teklif_reddedildi')
where o.legacy_code is not null
  and o.stage_id = (select id from public.operation_stages where key = 'iptal');

-- 4) Bu operasyonların quote'ları → reddedildi + gerekçe + yanıt tarihi.
--    responded_at = cancelled_at (import'ta son_guncelleme yazılmıştı); 5. adım temizlemeden ÖNCE okunur.
update public.quotes q
set status_id      = (select id from public.quote_statuses where key = 'reddedildi'),
    rejection_note = coalesce(o.cancellation_note, 'Teklif reddedildi (Süreç Takip aktarımı)'),
    responded_at   = o.cancelled_at
from public.operations o
where q.operation_id = o.id
  and o.legacy_code is not null
  and o.stage_id = (select id from public.operation_stages where key = 'teklif_reddedildi');

-- 5) Artık "iptal" değil → iptal alanlarını temizle.
update public.operations o
set cancelled_at           = null,
    cancelled_by           = null,
    cancellation_reason_id = null,
    cancellation_note      = null
where o.legacy_code is not null
  and o.stage_id = (select id from public.operation_stages where key = 'teklif_reddedildi');

-- Trigger'ları geri aç (SET LOCAL commit'te zaten otomatik döner; açıkça yazıyoruz).
set local session_replication_role = 'origin';

commit;

-- =====================================================================
-- Uygulama sonrası doğrulama (elle):
--   select st.key, count(*) from operations o join operation_stages st on st.id=o.stage_id
--     where o.legacy_code is not null group by 1;         -- iptal=0, teklif_reddedildi=155 beklenir
--   select qs.key, count(*) from quotes q join operations o on o.id=q.operation_id
--     join quote_statuses qs on qs.id=q.status_id where o.legacy_code is not null group by 1;  -- reddedildi=155
--   select count(*) from operations where legacy_code is not null and cancelled_at is not null; -- 0
-- =====================================================================
