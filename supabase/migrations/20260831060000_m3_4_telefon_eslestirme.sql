-- =====================================================================
-- M3.4 — Telefonla kişi bulma (gelen WhatsApp mesajı için)
--
-- Gelen mesajın hangi lead/müşteriye ait olduğu telefonun SON 10 HANESİ ile bulunur
-- (+90 / 0090 / 90 / boşluk farkları bu sayede sorun olmuyor — CRM'in her yerindeki kural).
--
-- Neden RPC: PostgREST bu ifadeyi filtre olarak kuramıyor; edge function 2.278 kaydı
-- çekip bellekte süzmek zorunda kalıyordu. İfade indeksi + RPC ile tek sorguya indi.
--
-- MÜŞTERİ LEAD'E ÜSTÜN: aynı numara ikisinde de varsa konuşma müşteri kartına düşer,
-- çünkü müşteri daha ileri bir kimliktir (lead dönüştüğünde eskisi arşivde kalabilir).
-- =====================================================================

create index if not exists contact_points_phone_son10_idx
  on public.contact_points (right(regexp_replace(value, '[^0-9]', '', 'g'), 10))
  where type = 'phone';

create or replace function public.find_entity_by_phone(p_phone text)
returns table (entity_type text, entity_id bigint)
language sql stable security definer set search_path = '' as $$
  select cp.entity_type, cp.entity_id
    from public.contact_points cp
   where cp.type = 'phone'
     and right(regexp_replace(cp.value, '[^0-9]', '', 'g'), 10)
       = right(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), 10)
     and length(right(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), 10)) = 10
   order by (cp.entity_type = 'customer') desc, cp.is_primary desc nulls last, cp.id
   limit 1;
$$;
comment on function public.find_entity_by_phone(text) is
  'Telefonun son 10 hanesiyle lead/müşteri bulur. Müşteri lead''e üstün gelir.';
grant execute on function public.find_entity_by_phone(text) to authenticated, service_role;
