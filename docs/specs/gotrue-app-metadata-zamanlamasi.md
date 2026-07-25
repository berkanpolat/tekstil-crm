# GoTrue app_metadata Zamanlaması — Önemli Uyarı

> Bu, uçtan uca test sırasında bir günü yiyen gerçek bir tuzaktır. İleride biri
> aynı duvara toslamasın diye buraya yazıldı.

## Bulgu

**`admin.createUser` (GoTrue Admin API) ile gönderilen `app_metadata`, `auth.users`
üzerindeki `AFTER INSERT` trigger'ı çalıştığında HENÜZ YAZILMAMIŞ olur.** GoTrue,
custom `app_metadata`'yı satır insert edildikten *sonra* uyguluyor. Trigger insert
anında `raw_app_meta_data` içinde yalnızca şunu görür:

```json
{ "provider": "email", "providers": ["email"] }
```

Gönderdiğiniz `created_by_admin`, `role_id`, `created_by` gibi alanlar **orada yoktur.**

`user_metadata` ise (signUp'ta `options.data`, admin.createUser'da `user_metadata`)
insert anında görünür.

## Nasıl teşhis edildi

`handle_new_user`'ı geçici olarak exception-logger ile sarıp (`public._debug`
tablosuna yazıp) `admin.createUser` çağrıldı. `_debug`'te:
`SQLSTATE=42501 | Kayıt kapalı` ve `app_meta={"provider":"email","providers":["email"]}`
— yani `created_by_admin` yok, `v_is_admin=false`, kayıt kilidi yanlışlıkla tetiklendi.
GoTrue dışarıya jenerik "Database error creating new user" (500) döndürdüğü için
gerçek sebep ancak trigger içinden yakalanabildi.

## Sonuç / kural

**Bir `auth.users` insert trigger'ı içinde `app_metadata`'ya GÜVENMEYİN.**

Doğru desenler:
1. Yetki/hassas alanları trigger'da değil, kullanıcı oluşturulduktan SONRA
   service_role ile UPDATE ederek yazın (bkz. `create-user` iki adımlı akış).
2. Kayıt kilidini/rol kararını `app_metadata`'ya değil, ya `user_metadata`'ya
   (yalnızca güvenilen bağlam yazıyorsa) ya da ayrı bir sunucu-tarafı kontrole
   dayandırın.

## Bu projede uygulanan çözüm

- Birincil kayıt kilidi: **platform seviyesinde signup-disable** (panel).
- `handle_new_user`: minimal köprü satırı; yedek kilit `user_metadata.created_by_admin`
  (forge edilse bile role_id metadata'dan gelmediği için zararsız).
- `create-user`: iki adımlı — `admin.createUser` + insert sonrası service_role UPDATE
  (role_id, created_by, profil). Fail-closed (UPDATE başarısız → kullanıcı ban'lanır).
- Owner: `bootstrap-owner` fonksiyonu (signup kapalı olduğu için).
