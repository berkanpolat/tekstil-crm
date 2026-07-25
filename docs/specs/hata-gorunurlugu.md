# Hata Görünürlüğü — Kalıcı Kural (tüm fazlar)

> Kabul testinde iki maddede kullanıcı "işlem başarılı oldu" dedi; ölçüm "backend
> zaten reddediyordu" dedi. Fark: **backend reddetti, arayüz kullanıcıya
> bildirmedi.** Bu, Faz 1+ (müşteri kaydı, teklif yükleme, sipariş) için veri kaybı
> gibi görünür. Bu kural bunu önler ve SONRAKİ TÜM FAZLARDA geçerlidir.

## Kural

**Hiçbir backend reddi sessizce yutulmaz.** RLS reddi, trigger exception'ı ve Edge
Function 4xx/5xx yanıtları kullanıcıya **görünür** (toast), **Türkçe**, **eyleme
dönük** bir mesaj olarak ulaşır. Başarı bildirimi yalnızca gerçek başarıda gösterilir.

Yasak: boş `catch {}`, boş `.catch(() => {})`, yalnızca `console.error` ile
geçiştirme, ham SQL hatasını gösterme, veya "bir hata oluştu" gibi boş mesaj.

## Kritik tuzak: sessiz RLS reddi

**PostgREST UPDATE/DELETE, RLS reddinde HATA DÖNDÜRMEZ — 0 satır etkiler.** Yani
`update(...).eq(...)` başarıyla döner ama hiçbir şey değişmez. UI `onSuccess`'i
tetikler, kullanıcı "başarılı" görür, veri değişmemiştir. BUG 2 tam olarak buydu.

**Çözüm:** yazma işlemlerinde `.select()` zincirle + `ensureRows()` kullan:
```ts
import { ensureRows } from '@/lib/errors'
ensureRows(await supabase.from('x').update(fields).eq('id', id).select('id'))
// 0 satır → AppError('...yetkiniz yok ya da kayıt bulunamadı') → görünür toast
```

## Merkezi çevirmen — `src/lib/errors.ts`

- `toUserMessage(error): Promise<string>` — TEK çeviri noktası:
  - Edge Function hatası → yanıt gövdesindeki `{error}` (bizim Türkçe mesajımız) veya
    status'e göre (401/403/404/…).
  - Postgres kodları: `42501` (yetki; İngilizce RLS jargonu → "yetkiniz yok", özel
    Türkçe trigger mesajı → aynen), `23505` (tekrar eden değer), `23503` (ilişkili
    kayıt), `23502` (zorunlu alan), `22P02` (geçersiz değer), `2F000`/`P0001`/`2BP01`
    (append-only / sistem koruması → özel mesaj).
  - İngilizce SQL jargonu kullanıcıya gösterilmez; anlamlı Türkçe fallback verilir.
- `ensureRows(result)` — 0 satırı görünür `AppError`'a çevirir.
- `AppError` — kullanıcıya gösterilecek mesajı taşır.

Kullanım (her mutasyon `catch`'inde):
```ts
try { await mutateAsync(...) ; toast.success('...') }
catch (err) { toast.error(await toUserMessage(err)) }
```

## Yetki reddinde ne görünür

Net toast: "Bu işlem için yetkiniz yok." Form sessizce kapanmaz, hiçbir şey olmaz
durumu kabul edilmez. Ayrıca UI, yetkisiz aksiyonları baştan gizler (bkz.
guvenlik-kabul-duzeltmeleri) — ama görünür hata, gizleme atlansa bile son güv.

## Testler

- Birim: `tests/unit/errors.test.ts` — `toUserMessage` kod eşlemeleri + `ensureRows`
  sessiz-red tespiti (10 senaryo).
- UI: `scripts/ui_security.mjs` — "backend reddi (yinelenen kod) GÖRÜNÜR toast oldu"
  testi: sadece "reddedildi mi" değil, "kullanıcı gördü mü" doğrulanır.

## Uygulanan yerler (Faz 0)

Tüm mutasyon hook'ları (`useStaff`, `useOrg`, `useSettings`, `useFiles`) ve sayfa
`catch` blokları merkezi çevirmene bağlandı; yazma işlemleri `ensureRows` ile sessiz
reddi yakalar. Sonraki fazlarda YENİ her mutasyon bu deseni kullanır.
