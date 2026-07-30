-- =====================================================================
-- P5.8 düzeltme (GÜVENLİK) — sales rolü finansal veri GÖRMEMELİ.
-- Kullanıcı QA kararı: satış rolü Finans menüsünü ve müşteri kartı Cari sekmesini
-- görmeyecek. Önceki "sales kendi müşterisini görür" tasarımı geçersiz. finance.view
-- sales'ten geri alınır → perms.view=false → arayüz+RLS her yerde kapanır.
-- =====================================================================
delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.role_id = r.id and rp.permission_id = p.id
  and r.key = 'sales' and p.key in ('finance.view','finance.edit','finance.export');
