-- =====================================================================
-- E.2 — Katalogdan gelen taslak teklifi onayla → gerçek teklif + durum ilerle.
-- Taslak documents(is_draft=true) satırının verisinden bir quotes kaydı üretir,
-- taslağı gerçek yapar (is_draft=false), operasyonu 'teklif_iletildi'ye taşır.
-- =====================================================================
create or replace function public.approve_draft_quote(p_document_id bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_op bigint; v_data jsonb; v_total numeric; v_qid bigint; v_ver int;
begin
  if not (public.has_permission('quotes.create') or exists (
      select 1 from users u join roles r on r.id=u.role_id where u.id=auth.uid() and r.key in ('owner','admin','manager','sales'))) then
    raise exception 'Teklif oluşturma yetkiniz yok.' using errcode = '42501';
  end if;

  select operation_id, data into v_op, v_data from documents where id = p_document_id and is_draft and deleted_at is null;
  if v_op is null then raise exception 'Taslak teklif bulunamadı ya da zaten onaylanmış.' using errcode = 'P0002'; end if;

  v_total := coalesce((v_data->>'toplam_usd')::numeric, 0);
  select coalesce(max(version),0)+1 into v_ver from quotes where operation_id = v_op;

  insert into quotes (operation_id, version, valid_until, tax_rate, currency, subtotal, total, status_id, created_by)
  values (v_op, v_ver, (now()+interval '7 days')::date, 10, 'USD', v_total, round(v_total*1.1,2),
          (select id from quote_statuses where key='gonderildi'), auth.uid())
  returning id into v_qid;

  update documents set is_draft = false where id = p_document_id;   -- taslak → gerçek
  perform public.op_advance_stage(v_op, 'teklif_iletildi');          -- durum ilerle
  return v_qid;
end $$;
grant execute on function public.approve_draft_quote(bigint) to authenticated;
