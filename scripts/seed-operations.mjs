// P3.13 — Örnek operasyon verisi: ~200 operasyon, 600 müşteriye dağılmış, farklı
// aşama/durum, SLA dağılımı, teklif versiyonları, numune revizyonları, siparişler.
// Temizlenebilir: tüm kayıtlar client_reference LIKE 'seed-op-%'.
// Kullanım:  node scripts/seed-operations.mjs [--clean]
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const PGURL = process.env.PGURL ?? readFileSync('/tmp/pgurl.txt', 'utf8').trim()
const psql = (s) => execFileSync('psql', [PGURL, '-qtAc', s], { encoding: 'utf8' }).trim()

if (process.argv.includes('--clean')) {
  psql(`delete from public.quote_items where quote_id in (select id from public.quotes where operation_id in (select id from public.operations where client_reference like 'seed-op-%'));
        delete from public.order_items where order_id in (select id from public.orders where operation_id in (select id from public.operations where client_reference like 'seed-op-%'));
        delete from public.quotes where operation_id in (select id from public.operations where client_reference like 'seed-op-%');
        delete from public.samples where operation_id in (select id from public.operations where client_reference like 'seed-op-%');
        delete from public.orders where operation_id in (select id from public.operations where client_reference like 'seed-op-%');
        delete from public.operation_items where operation_id in (select id from public.operations where client_reference like 'seed-op-%');
        delete from public.event_log where entity_type='operation' and entity_id in (select id::text from public.operations where client_reference like 'seed-op-%');
        delete from public.operations where client_reference like 'seed-op-%';`)
  console.log('Temizlendi: seed-op-% operasyonları ve alt kayıtları.')
  process.exit(0)
}

psql(`
do $$
declare
  i int; v_op bigint; v_cust bigint; v_cat bigint; v_type bigint; v_stage record;
  v_q bigint; v_s bigint; v_o bigint; v_days int; v_req timestamptz;
  stages text[] := array['teklif_bekliyor','teklif_bekliyor','teklif_iletildi','numune','siparis','uretim','teslimat','tamamlandi'];
  v_key text;
begin
  for i in 1..200 loop
    select id into v_cust from public.customers where deleted_at is null order by random() limit 1;
    select id into v_cat from public.product_categories where parent_id is null and is_active order by random() limit 1;
    select id into v_type from public.product_categories where parent_id = v_cat and is_active order by random() limit 1;
    v_key := stages[1 + floor(random()*array_length(stages,1))::int];
    v_days := floor(random()*60)::int;                         -- son 60 gün
    v_req := now() - make_interval(days => v_days, hours => floor(random()*8)::int);

    insert into public.operations (customer_id, category_id, type_id, requested_at, source, client_reference,
       stage_id, channel_id, province_id, product_source, description)
    values (v_cust, v_cat, v_type, v_req,
      (array['manuel','telefon','whatsapp','web_sitesi'])[1+floor(random()*4)::int],
      'seed-op-'||i,
      (select id from public.operation_stages where key=v_key),
      (select id from public.request_channels order by random() limit 1),
      (select id from public.provinces order by random() limit 1),
      (array['gorsel_yukleme','katalogdan_secim'])[1+floor(random()*2)::int],
      (array['Standart üretim talebi','Acil termin','Numune sonrası revizyon','Tekrar sipariş', null])[1+floor(random()*5)::int])
    returning id into v_op;

    -- Ürün kalemi (çoğunda)
    if random() < 0.7 then
      insert into public.operation_items (operation_id, name, quantity, fabric)
      values (v_op, 'Ürün '||i, (array[250,500,1000,2000,5000])[1+floor(random()*5)::int],
        (array['Süprem','İnterlok','Ribana','Polar','Denim'])[1+floor(random()*5)::int]);
    end if;

    -- Teklif (teklif aşaması ve sonrası)
    if v_key in ('teklif_iletildi','numune','siparis','uretim','teslimat','tamamlandi') then
      insert into public.quotes (operation_id, status_id) values (v_op,
        (select id from public.quote_statuses where key = case when v_key='teklif_iletildi' then 'gonderildi' else 'kabul_edildi' end)) returning id into v_q;
      insert into public.quote_items (quote_id, name, quantity, unit_price)
        values (v_q, 'Kalem A', 1000, 8 + floor(random()*10));
      -- Bazılarında v2 revizyon
      if random() < 0.35 then perform public.create_quote_revision(v_q); end if;
    end if;

    -- Numune (numune aşaması ve sonrası)
    if v_key in ('numune','siparis','uretim','teslimat','tamamlandi') then
      insert into public.samples (operation_id, status_id, description)
        values (v_op, (select id from public.sample_statuses where key = case when v_key='numune' then 'musteriye_gonderildi' else 'onaylandi' end),
          'Numune '||i) returning id into v_s;
      if v_key <> 'numune' then
        update public.samples set approved_at = v_req + interval '3 days', approval_method='whatsapp' where id=v_s;
      end if;
      if random() < 0.3 then perform public.revise_sample(v_s, 'Demo revizyon'); end if;
    end if;

    -- Sipariş (siparis aşaması ve sonrası)
    if v_key in ('siparis','uretim','teslimat','tamamlandi') then
      insert into public.orders (operation_id, status_id, promised_delivery, planned_delivery)
        values (v_op, (select id from public.order_statuses where key = case
            when v_key='siparis' then 'olusturuldu' when v_key='uretim' then 'uretimde'
            when v_key='teslimat' then 'sevkiyata_hazir' else 'tamamlandi' end),
          (v_req + interval '30 days')::date, (v_req + interval '28 days')::date) returning id into v_o;
      insert into public.order_items (order_id, name, quantity, produced_quantity, unit_price)
        values (v_o, 'Kalem A', 1000, case when v_key='tamamlandi' then 1000 else floor(random()*1000)::int end, 10);
      if v_key='tamamlandi' then update public.orders set actual_delivery=(v_req + interval '29 days')::date, shipped_at=v_req+interval '27 days' where id=v_o; end if;
    end if;
  end loop;
end $$;
`)

const stats = psql(`select
  (select count(*) from public.operations where client_reference like 'seed-op-%') as op,
  (select count(*) from public.quotes where operation_id in (select id from public.operations where client_reference like 'seed-op-%')) as teklif,
  (select count(*) from public.samples where operation_id in (select id from public.operations where client_reference like 'seed-op-%')) as numune,
  (select count(*) from public.orders where operation_id in (select id from public.operations where client_reference like 'seed-op-%')) as siparis,
  (select count(*) from public.operations where client_reference like 'seed-op-%' and sla_deadline < now()) as sla_gecmis`)
console.log('Seed tamam →', stats, '(op | teklif | numune | sipariş | sla_geçmiş)')
