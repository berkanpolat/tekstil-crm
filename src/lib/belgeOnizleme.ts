/**
 * Canlı belge önizlemesi — TARAYICIDA üretilir, sunucuya gitmez.
 *
 * Neden: editör yazarken (debounce'lu da olsa) sürekli önizleme ister. Bunu belge
 * motoruna bağlamak, PDF için ayrılmış günlük tarayıcı bütçesini dakikalar içinde
 * bitirirdi. Oysa önizlemenin ihtiyaç duyduğu tek şey bir tarayıcı — kullanıcının
 * zaten önünde duran şey.
 *
 * Nasıl: `public/belge-sablonu.html` (studyo şablonu + derleme anında gömülen
 * buildDoc/renderPreview — bkz. services/pdf-worker/scripts/sablon-hazirla.mjs)
 * gizli bir iframe'de bir kez yüklenir, sonra her istek postMessage ile gider.
 *
 * GÜVENLİK: iframe `sandbox="allow-scripts"` ile açılır, `allow-same-origin`
 * VERİLMEZ → opak origin. Şablona enjekte edilen bir betik (rapor.bodyHtml,
 * maliyet.image, tkS.foto gibi kaçışsız alanlar üzerinden) CRM'in localStorage'ına
 * ve dolayısıyla Supabase oturum jetonuna erişemez. Şablonun kendi CSP'si de
 * `connect-src 'none'` ile veri sızdırmayı kapatır.
 */

const SABLON_YOLU = '/belge-sablonu.html'
const HAZIR_ZAMAN_ASIMI = 15_000
const ISTEK_ZAMAN_ASIMI = 15_000

interface Bekleyen { çöz: (html: string) => void; kır: (e: Error) => void; zamanlayıcı: number }

let cerceve: HTMLIFrameElement | null = null
let hazir: Promise<HTMLIFrameElement> | null = null
let sonId = 0
const bekleyenler = new Map<number, Bekleyen>()

function mesajDinle(ev: MessageEvent) {
  // Opak origin'den gelir (ev.origin === 'null'), bu yüzden origin kontrolü işe
  // yaramaz; kimlik doğrulaması KAYNAK PENCERE üzerinden yapılır.
  if (!cerceve || ev.source !== cerceve.contentWindow) return
  const m = ev.data as { __belgeOnizlemeYanit?: boolean; id?: number; html?: string; hata?: string } | null
  if (!m?.__belgeOnizlemeYanit || typeof m.id !== 'number') return

  const b = bekleyenler.get(m.id)
  if (!b) return
  bekleyenler.delete(m.id)
  clearTimeout(b.zamanlayıcı)
  if (typeof m.html === 'string') b.çöz(m.html)
  else b.kır(new Error(m.hata || 'Önizleme üretilemedi.'))
}

/** Gizli iframe'i bir kez kurar; şablon "hazırım" diyene kadar bekler. */
function cerceveHazirla(): Promise<HTMLIFrameElement> {
  if (hazir) return hazir

  hazir = new Promise<HTMLIFrameElement>((çöz, kır) => {
    const el = document.createElement('iframe')
    el.setAttribute('sandbox', 'allow-scripts') // allow-same-origin BİLEREK yok
    el.setAttribute('aria-hidden', 'true')
    el.setAttribute('title', 'Belge şablonu (gizli)')
    // display:none bazı tarayıcılarda düzen ölçümünü bozar; görünmez ama düzenli tut.
    el.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px;height:1300px;border:0;visibility:hidden'

    const zamanlayıcı = window.setTimeout(() => {
      kır(new Error('Belge şablonu yüklenemedi (zaman aşımı).'))
      hazir = null
    }, HAZIR_ZAMAN_ASIMI)

    function hazirDinle(ev: MessageEvent) {
      if (ev.source !== el.contentWindow) return
      if (!(ev.data as { __belgeSablonuHazir?: boolean } | null)?.__belgeSablonuHazir) return
      window.removeEventListener('message', hazirDinle)
      clearTimeout(zamanlayıcı)
      cerceve = el
      window.addEventListener('message', mesajDinle)
      çöz(el)
    }
    window.addEventListener('message', hazirDinle)

    el.src = SABLON_YOLU
    document.body.appendChild(el)
  })

  return hazir
}

/**
 * Belgeyi tarayıcıda kurar ve önizleme HTML'i döndürür — PDF'le AYNI kaynaktan
 * (buildDoc) üretilir, dolayısıyla ekrandaki ile çıktı birebir tutar.
 */
export function onizlemeHtmlUret(
  template: string,
  data: Record<string, unknown>,
  language: string,
): Promise<string> {
  return cerceveHazirla().then((el) => new Promise<string>((çöz, kır) => {
    const id = ++sonId
    const zamanlayıcı = window.setTimeout(() => {
      bekleyenler.delete(id)
      kır(new Error('Önizleme zaman aşımına uğradı.'))
    }, ISTEK_ZAMAN_ASIMI)

    bekleyenler.set(id, { çöz, kır, zamanlayıcı })
    el.contentWindow?.postMessage({ __belgeOnizleme: true, id, template, data, language }, '*')
  }))
}
