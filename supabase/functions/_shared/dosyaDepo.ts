// dosyaDepo.ts — Kenar işlevlerinden dosya servisine yazma köprüsü.
//
// Kenar işlevinin kullanıcı jetonu yoktur; /y ucu bu yüzden servis sırrını
// kabul eder. Sır YALNIZ sunucu bileşenleri arasında yaşar, tarayıcıya
// asla ulaşmaz. Bu, intake-request'in kendi girişindeki INTAKE_SECRET
// kalıbının aynısı.

export interface DepoOrtam {
  url: string
  sir: string
}

/**
 * Kullanıcıdan gelen dosya adını YOL'da kullanılabilir hâle getirir.
 *
 * İki aşama şart: izinsiz karakterler `_`ye çevrilir VE ardışık noktalar
 * tekilleştirilir. İkincisi olmazsa `rapor..pdf` gibi bir ad Worker'ın
 * `yolGecerli` kuralından geçmez (`..` alt dizi olarak her yerde yasak) ve
 * talep girişindeki dosya SESSİZCE kaybolur.
 */
export function guvenliDosyaAdi(ad: string): string {
  return ad.replace(/[^a-zA-Z0-9_\-.]/g, '_').replace(/\.{2,}/g, '_').slice(0, 80) || 'dosya'
}

/** @returns yazıldıysa true. ASLA fırlatmaz — talep girişi dosya yüzünden düşmemeli. */
export async function depolamayaYaz(
  yol: string,
  bayt: Uint8Array,
  mime: string,
  ortam: DepoOrtam,
  getir: typeof fetch = fetch,
): Promise<boolean> {
  if (!ortam.url || !ortam.sir) return false
  try {
    const r = await getir(`${ortam.url}/y?yol=${encodeURIComponent(yol)}`, {
      method: 'PUT',
      headers: {
        'content-type': mime,
        'content-length': String(bayt.byteLength),
        'x-servis-sirri': ortam.sir,
      },
      // TS'in DOM lib'i Uint8Array<ArrayBufferLike>'ı BodyInit'e tam eşlemiyor
      // (kütüphane sürüm uyuşmazlığı); çalışma zamanında fetch bunu sorunsuz kabul eder.
      body: bayt as BodyInit,
    })
    return r.ok
  } catch {
    return false
  }
}
