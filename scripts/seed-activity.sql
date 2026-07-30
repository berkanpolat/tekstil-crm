-- =====================================================================
-- P1.11 — Örnek aktivite üreteci (seed leads/customers üzerine).
-- İletişim noktaları (tüm seed kayıtlara telefon+e-posta), + bir alt kümeye
-- etkileşim/not/etiket. Trigger'lar last_interaction_at + event_log'u besler.
-- Tekrar-çalıştırılabilir: `not exists` ile mükerrer üretmez.
-- Temizlik: value/summary/body 'ÖRNEK'/'seed' işaretli değil; parça parça sil
--   (bkz. scripts/reset-sample-data.sql) — ya da tüm seed kayıtları sil.
-- =====================================================================

-- ---- İletişim noktaları: her seed lead + customer → telefon + e-posta ----
-- Telefon BENZERSİZ (id-tabanlı; lead 0532-, customer 0533- öneki). Dar havuz
-- çakışması yanlış mükerrer alarmı üretiyordu — gerçek numaralar benzersizdir.
insert into public.contact_points (entity_type, entity_id, type, value)
select 'lead', l.id, 'phone', '0532' || lpad(l.id::text, 7, '0')
from public.leads l
where l.external_source = 'seed' and l.deleted_at is null
  and not exists (select 1 from public.contact_points cp where cp.entity_type='lead' and cp.entity_id=l.id and cp.type='phone');

insert into public.contact_points (entity_type, entity_id, type, value)
select 'lead', l.id, 'email', 'info' || l.id || '@ornek.com'
from public.leads l
where l.external_source = 'seed' and l.deleted_at is null and l.company_name is not null
  and not exists (select 1 from public.contact_points cp where cp.entity_type='lead' and cp.entity_id=l.id and cp.type='email');

insert into public.contact_points (entity_type, entity_id, type, value)
select 'customer', c.id, 'phone', '0533' || lpad(c.id::text, 7, '0')
from public.customers c
where c.external_source = 'seed' and c.deleted_at is null
  and not exists (select 1 from public.contact_points cp where cp.entity_type='customer' and cp.entity_id=c.id and cp.type='phone');

-- ---- Etkileşimler: ~%15 lead (id%7=0), 1-2 kayıt ----
insert into public.interactions (entity_type, entity_id, channel_id, direction, summary, occurred_at)
select 'lead', l.id,
  (select id from public.interaction_channels where key = (array['telefon','eposta','whatsapp'])[1 + (l.id % 3)]),
  (array['outbound','inbound'])[1 + (l.id % 2)],
  'ÖRNEK: ' || (array['İlk temas kuruldu','Fiyat listesi gönderildi','Numune talep edildi','Geri dönüş bekleniyor'])[1 + (l.id % 4)],
  now() - ((l.id % 60) || ' days')::interval
from public.leads l
where l.external_source = 'seed' and l.deleted_at is null and l.id % 7 = 0
  and not exists (select 1 from public.interactions i where i.entity_type='lead' and i.entity_id=l.id);

-- ---- Notlar: ~%10 lead (id%10=0) ----
insert into public.notes (entity_type, entity_id, body)
select 'lead', l.id, 'ÖRNEK: ' || (array['Organik pamuk sertifikası istiyor.','Sezon sonu için planlıyor.','Rakip fiyatı soruyor.','Numune onayı bekleniyor.'])[1 + (l.id % 4)]
from public.leads l
where l.external_source = 'seed' and l.deleted_at is null and l.id % 10 = 0
  and not exists (select 1 from public.notes n where n.entity_type='lead' and n.entity_id=l.id);

-- ---- Etiketler: ~%20 lead (id%5=0), rastgele sistem etiketi ----
insert into public.entity_tags (entity_type, entity_id, tag_id)
select 'lead', l.id, (select id from public.tags order by (l.id % 6) limit 1 offset (l.id % 6))
from public.leads l
where l.external_source = 'seed' and l.deleted_at is null and l.id % 5 = 0
  and not exists (select 1 from public.entity_tags et where et.entity_type='lead' and et.entity_id=l.id)
on conflict do nothing;
