import { supabase } from './supabase'
import { env } from './env'

/**
 * Dosya servisinin oturum çerezini tazeler.
 *
 * Bir <img> etiketi Authorization başlığı gönderemez; bu yüzden kimlik
 * çerezle taşınır. Çerez ömrü jetonun ömrüne eşittir, o yüzden Supabase
 * jetonu yenilediğinde bu da yenilenmelidir.
 *
 * Eşzamanlı çağrılar tekilleştirilir: 40 görsellik bir ızgarada hepsi aynı
 * anda hata alırsa 40 istek değil bir istek çıkar.
 */
let bekleyen: Promise<void> | null = null

export function oturumTazele(): Promise<void> {
  if (bekleyen) return bekleyen
  bekleyen = (async () => {
    if (!env.dosyaUrl) return
    const { data } = await supabase.auth.getSession()
    const jeton = data.session?.access_token
    if (!jeton) return
    try {
      await fetch(`${env.dosyaUrl}/oturum`, {
        method: 'POST',
        credentials: 'include',
        headers: { authorization: `Bearer ${jeton}` },
      })
    } catch {
      // Ağ hatası: sessiz geç. Çağıran zaten yeniden deneyecek.
    }
  })().finally(() => {
    bekleyen = null
  })
  return bekleyen
}

/** Giriş/çıkış ve jeton yenilemede çerezi eşle. Uygulama açılışında bir kez kurulur. */
export function dosyaOturumunuBagla(): () => void {
  const { data } = supabase.auth.onAuthStateChange((olay) => {
    if (olay === 'SIGNED_IN' || olay === 'TOKEN_REFRESHED' || olay === 'INITIAL_SESSION') {
      void oturumTazele()
    }
  })
  return () => data.subscription.unsubscribe()
}
