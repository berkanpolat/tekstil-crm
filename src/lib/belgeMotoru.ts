/**
 * Belge motoru istemcisi — PDF üretimi ve TCMB kuru için TEK kapı.
 *
 * Motor bir Cloudflare Worker'dır (services/pdf-worker/): Browser Run üzerinde
 * gerçek Chromium çalıştırıp orijinal studyo şablonlarını birebir basar.
 *
 * Neden tek dosya: `/render` dört yerden çağrılıyor (belge motoru, raporlar,
 * maliyet belgesi, cari ekstre). Kimlik ve hata eşlemesi her birine ayrı ayrı
 * kopyalanırsa biri güncellenmeyi kaçırır — nitekim eskiden dördü de kimliksizdi.
 *
 * Kimlik: kullanıcının Supabase oturum jetonu. Önyüz derlemesine gömülen paylaşılan
 * bir sır YOKTUR (eski `x-pdf-secret` böyleydi ve pratikte hiç gönderilmiyordu).
 */
import { env, hasPdfService, PDF_UNAVAILABLE } from './env'
import { supabase } from './supabase'

const taban = () => env.pdfServiceUrl.replace(/\/$/, '')

export interface BelgeIstegi {
  template: string
  data: Record<string, unknown>
  language?: string
}

/** Motorun döndürdüğü HTTP durumunu kullanıcının anlayacağı tek cümleye çevirir. */
function hataMesaji(status: number): string {
  // Kotayı genel hatadan ayırmak önemli: "servis bozuk" sanan kullanıcı tekrar tekrar
  // dener, her deneme kalan bütçeden yer. Ne olduğu ve ne zaman geçeceği söylenmeli.
  if (status === 429) return 'Günlük belge üretim kotası doldu. Yarın tekrar deneyin ya da planı yükseltin.'
  if (status === 401) return 'Belge motoru oturumu doğrulayamadı; çıkış yapıp yeniden girin.'
  if (status === 400) return 'Belge verisi eksik ya da geçersiz.'
  return `Belge motoru hatası (${status}). Servis çalışıyor mu? (${env.pdfServiceUrl})`
}

/** PDF üretir. Servis yoksa / oturum yoksa / motor hata verirse throw eder. */
export async function belgePdfUret({ template, data, language = 'tr' }: BelgeIstegi): Promise<Blob> {
  if (!hasPdfService) throw new Error(PDF_UNAVAILABLE)

  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Oturum bulunamadı; belge üretmek için yeniden giriş yapın.')

  const res = await fetch(`${taban()}/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ template, data, language }),
  })
  if (!res.ok) throw new Error(hataMesaji(res.status))
  return res.blob()
}

export interface Kur { USD: number | null; EUR: number | null; GBP: number | null; date: string; source: string }

/** Günlük TCMB döviz satış kuru. Motor sunucu tarafında çeker (tarayıcı CORS'una takılmaz). */
export async function kurlar(): Promise<Kur | null> {
  if (!hasPdfService) return null
  try {
    const res = await fetch(`${taban()}/rates`)
    if (!res.ok) return null
    return (await res.json()) as Kur
  } catch { return null }
}

export interface TarihliKur { found: boolean; date: string; bulletinDate?: string; USD?: number; EUR?: number; GBP?: number }

/** Belirli tarihteki TCMB kuru (ödeme günü kuru). Hafta sonu/tatilde en yakın önceki
 *  bültene yürünür; bulletinDate gerçek bülten tarihini verir. found=false → kur yok. */
export async function kurTarihli(date: string): Promise<TarihliKur | null> {
  if (!hasPdfService) return null
  try {
    const res = await fetch(`${taban()}/rate-on-date?date=${encodeURIComponent(date)}`)
    if (!res.ok) return null
    return (await res.json()) as TarihliKur
  } catch { return null }
}
