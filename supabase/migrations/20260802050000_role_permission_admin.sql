-- =====================================================================
-- P7.12 — Rapor/finans yetkilerini rol bazında yönetme (owner/admin).
-- role_permissions RLS'li + politikasız → yalnız SECURITY DEFINER erişir.
-- guard_role_permission tetikleyicisi zaten "sahip olmadığın yetkiyi
-- veremezsin" kuralını uygular; bu fonksiyonlar owner/admin kapısı ekler.
-- Yönetilebilir küme: reports.* + finance.* (kritik/sistem yetkileri hariç).
-- =====================================================================

create or replace function public.report_permission_matrix()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not exists (select 1 from users u join roles r on r.id=u.role_id where u.id=auth.uid() and r.key in ('owner','admin')) then
    raise exception 'Yetki yönetimi için Sahip/Yönetici olmalısınız.' using errcode='42501';
  end if;
  select jsonb_build_object(
    'permissions', (select jsonb_agg(jsonb_build_object('key',key,'label',description,'module',module) order by module, key)
                     from permissions where module in ('reports','finance')),
    'roles', (select jsonb_agg(jsonb_build_object(
        'key', r.key, 'name', r.name, 'is_owner', (r.key='owner'),
        'granted', coalesce((select jsonb_agg(p.key) from role_permissions rp join permissions p on p.id=rp.permission_id
                     where rp.role_id=r.id and p.module in ('reports','finance')), '[]'::jsonb)
      ) order by r.id) from roles r)
  ) into v;
  return v;
end $$;

create or replace function public.set_role_permission(p_role_key text, p_perm_key text, p_granted boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_role_id int; v_perm_id int; v_module text;
begin
  if not exists (select 1 from users u join roles r on r.id=u.role_id where u.id=auth.uid() and r.key in ('owner','admin')) then
    raise exception 'Yetki yönetimi için Sahip/Yönetici olmalısınız.' using errcode='42501';
  end if;
  if p_role_key='owner' then raise exception 'Sahip rolünün yetkileri değiştirilemez.' using errcode='42501'; end if;
  select id into v_role_id from roles where key=p_role_key;
  select id, module into v_perm_id, v_module from permissions where key=p_perm_key;
  if v_role_id is null or v_perm_id is null then raise exception 'Rol veya yetki bulunamadı.'; end if;
  if v_module not in ('reports','finance') then raise exception 'Bu ekrandan yalnız rapor/finans yetkileri yönetilir.' using errcode='42501'; end if;
  if p_granted then
    insert into role_permissions (role_id, permission_id) values (v_role_id, v_perm_id) on conflict do nothing;  -- guard_role_permission tetikleyicisi "sahip olduğun yetki" kuralını uygular
  else
    delete from role_permissions where role_id=v_role_id and permission_id=v_perm_id;
  end if;
end $$;

grant execute on function public.report_permission_matrix() to authenticated;
grant execute on function public.set_role_permission(text,text,boolean) to authenticated;
revoke execute on function public.report_permission_matrix() from anon;
revoke execute on function public.set_role_permission(text,text,boolean) from anon;
