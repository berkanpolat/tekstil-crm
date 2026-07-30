# PDF servisi — lexical durum değişkenlerine erişim (kırılgan teknik + koruma)

## Bağlam

Belge motoru (`services/pdf-renderer/`), orijinal studyo uygulamasını
(`templates/studio.html`) Playwright'ta yükleyip **kendi saf fonksiyonlarını**
çağırır (`tkQuoteDoc`, `siparisDocHTML`, `soDoc`, `numuneHTML`, `stickerHTML`).
Böylece tasarım birebir korunur — yeniden yazma yok, "taşı ve sarmala".

Bu fonksiyonlar girdiyi **global durum nesnelerinden** okur:

| Belge | Durum değişkeni | Tanım |
|---|---|---|
| Fiyat teklifi | `tkS` | `var tkS = null` |
| Sipariş formu | `sip` | `let sip = {...}` |
| Sipariş onay | `soS` | `let soS` |
| Numune etiketi | `norder` | `let norder = {...}` |
| Koli üstü | `order` | `let order = {...}` |

## Sorun: `let` window'a düşmez

Klasik betikte `var tkS` **global window özelliği** oluşturur → `window.tkS`
ile yazılabilir. Ama `let sip` / `let order` / `let norder` / `let soS`
**window'a düşmez**; yalnızca betiğin lexical (sözcüksel) bağlamasında yaşar.

`window.norder = {...}` yazmak numuneHTML'in okuduğu lexical `norder`'ı
DEĞİŞTİRMEZ → belge sessizce **boş** üretilir (alanlar "—").

## Çözüm: `window.eval` ile lexical bağlamaya yaz

`render.mjs` durum değişkenlerini şöyle set eder:

```js
window.eval(name + ' = ' + JSON.stringify(val) + ';')
```

`window.eval` global kapsamda çalışır; `norder = {...}` **mevcut** lexical
`let norder` bağlamasını yeniden atar. Bu yüzden çalışır.

## Nerede kırılır (sessizce!)

1. **Yeniden adlandırma:** studio.html `let norder` → `let nOrder` olursa,
   `window.eval('norder = ...')` artık bir **yeni window global'i** yaratır;
   numuneHTML hâlâ `nOrder`'ı okur → **boş belge**, hata yok.
2. **Kaldırma:** değişken tanımı silinirse eval bir global yaratır ama fonksiyon
   ReferenceError verebilir (bu en azından gürültülü).
3. **`const`'a çevirme:** `const` yeniden atanamaz → eval `TypeError` verir (gürültülü).

En tehlikelisi (1): **sessiz boş belge.**

## Koruma: açılış self-check'i

`server.mjs` sıcak sayfayı yüklerken, **hiçbir setVar çalışmadan önce** beş
değişkenin lexical bağlamada var olduğunu bare-referansla doğrular:

```js
for (const n of ['tkS','sip','soS','norder','order'])
  try { window.eval('void ' + n) } catch { bad.push(n) }  // undeclared/renamed → ReferenceError
if (bad.length) throw new Error('Şablon durum değişkenleri erişilemiyor: ' + bad.join(', '))
```

Biri erişilemiyorsa **servis açık hata verir ve boot olmaz** — sessizce boş
belge üretmez. Bu kontrol setVar'dan ÖNCE çalışmalı: setVar bir kez çalışınca
eksik değişken için bir window global'i oluşur ve kontrol yanıltıcı biçimde geçer.

## Şablonu güncellerken kural

`studio.html`'i yeniden dışa aktarırsanız:
1. Beş durum değişkeninin **adı değişmediğini** doğrulayın.
2. Servisi başlatın — self-check geçmezse hata mesajındaki değişkeni bulun,
   `STATE_VARS` ve `render.mjs`'i güncelleyin.
3. Beş belgeyi örnek PDF'lerle yeniden karşılaştırın (birebir).

## Daha sağlam alternatif (ileride)

Uçtan uca probe: her şablona bilinen bir değer (`__PROBE__`) enjekte edip
üretilen HTML'de görünmesini doğrulamak, yeniden adlandırmayı da yakalar. Şu an
bare-referans kontrolü yeterli; probe'a ihtiyaç olursa buraya eklenir.
