# Zaman dilimi tuzağı — tarih üreten / gün bazlı gruplayan her yer

## Sorun

`timestamptz` değerleri veritabanında UTC saklanır. `to_char(ts, 'DD.MM.YYYY')`,
`ts::date`, `date_trunc('day', ts)` gibi işlemler **oturumun saat dilimine** göre
çalışır. Supabase sunucusunda oturum varsayılanı **UTC**'dir. Türkiye UTC+3
olduğu için:

- 27 Temmuz 00:30 (TR) = 26 Temmuz 21:30 (UTC)
- Sunucuda `to_char(...)` → **26.07**, tarayıcıda yerel gösterim → **27 Tem**

Yani gece yarısı–03:00 arası üretilen her tarih **bir gün geride** çıkar.

## İlk görüldüğü yer

P3.3 talep otomatik başlığı: "Kadın Giyim Bluz — 26.07.2026" derken kartta
"Talep tarihi 27 Tem" görünüyordu. (`operations_before_insert` düzeltildi.)

## Kural

Tarih üreten veya güne göre gruplayan **her** SQL, iş saat dilimini açıkça
kullanmalı. Sunucu varsayılanına asla güvenme.

```sql
-- YANLIŞ (sunucu TZ = UTC)
to_char(new.requested_at, 'DD.MM.YYYY')
new.requested_at::date
date_trunc('day', occurred_at)

-- DOĞRU (iş saat diliminde)
to_char((new.requested_at at time zone public.app_timezone())::date, 'DD.MM.YYYY')
(new.requested_at at time zone public.app_timezone())::date
date_trunc('day', occurred_at at time zone public.app_timezone())
```

## Tek kaynak

- Ayar: `settings.system.timezone` (IANA, varsayılan `Europe/Istanbul`).
- Fonksiyon: `public.app_timezone()` (STABLE) — ayarı okur, bulamazsa
  `Europe/Istanbul` döner.
- Migration: `20260726410000_system_timezone.sql`.

Saat dilimi değişirse (ör. yurt dışı şube) yalnızca ayar güncellenir; kod ve
migration'a dokunulmaz.

## Nerede tekrar çıkacak — önceden işaretle

- **P3.8 SLA hesabı** — çalışma saatleri gün sınırları iş TZ'sinde olmalı;
  `sla_deadline` ve "bugün dolacaklar" filtresi UTC'de kayar.
- **Faz 7 gün/hafta/ay bazlı raporlar** — `date_trunc` ve tarih ekseni gruplaması
  iş TZ'sinde yapılmazsa gece üretilen kayıtlar yanlış güne düşer.
- Frontend'de `new Date(iso).toLocaleDateString('tr-TR')` zaten yerel (tarayıcı)
  TZ kullanır; sorun yalnızca **sunucu tarafı** SQL'de. İkisinin tutarlı olması
  için sunucu da iş TZ'sini kullanmalı.
