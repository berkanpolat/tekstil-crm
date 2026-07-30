-- =====================================================================
-- settings.is_deprecated — ayarları emekliye ayırma kalıbı. Ayarlar silinemez
-- (settings_no_delete); ölü satırlar işaretlenir, UI varsayılan gizler,
-- "kullanım dışı ayarları göster" ile görünür. İleride başka ayarlar da aynı yolla.
-- =====================================================================
alter table public.settings
  add column is_deprecated boolean not null default false;

comment on column public.settings.is_deprecated is
  'Kullanım dışı ayar. UI varsayılan gizler; "kullanım dışı ayarları göster" ile görünür.';

-- codes.operation_prefix → kullanım dışı (codes.default_prefix + codes.<entity_type>_prefix ile değişti).
update public.settings
set is_deprecated = true,
    description = 'KULLANIM DIŞI — codes.default_prefix ve codes.<entity_type>_prefix ile değiştirildi (26.07.2026). Silinemez, settings silme koruması var.'
where key = 'codes.operation_prefix';
