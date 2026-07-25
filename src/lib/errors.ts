/**
 * Merkezi hata görünürlüğü — TEK doğruluk kaynağı. Backend reddi (RLS, trigger,
 * Edge Function 4xx/5xx) kullanıcıya HER ZAMAN anlaşılır, Türkçe, eyleme dönük bir
 * mesaj olarak ulaşır. Sessizce yutulan hata YASAK (bkz. docs/specs/hata-gorunurlugu.md).
 *
 * Kritik: PostgREST UPDATE/DELETE, RLS reddinde HATA döndürmez — 0 satır etkiler.
 * Bu "sessiz reddi" `ensureRows` görünür hataya çevirir.
 */

/** Kullanıcıya gösterilecek mesajı taşıyan hata. */
export class AppError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AppError'
  }
}

const PG_CODE_MESSAGES: Record<string, string> = {
  '23505': 'Bu değer zaten kullanılıyor. Lütfen farklı bir değer girin.',
  '23503': 'Bu kayıt başka kayıtlarla ilişkili olduğu için işlem tamamlanamadı.',
  '23502': 'Zorunlu bir alan boş bırakılamaz.',
  '22P02': 'Girilen değer geçersiz. Lütfen kontrol edin.',
  '22004': 'Zorunlu bir alan eksik.',
}

const ENGLISH_JARGON = /row-level security|permission denied|violates|duplicate key|JSON|fetch|network|null value/i

interface FunctionsHttpError {
  context: Response
  message: string
}
function isFunctionsHttpError(e: unknown): e is FunctionsHttpError {
  return (
    !!e &&
    typeof e === 'object' &&
    'context' in e &&
    (e as { context?: unknown }).context instanceof Response
  )
}

/** Herhangi bir hatayı kullanıcıya gösterilecek Türkçe mesaja çevirir. */
export async function toUserMessage(error: unknown): Promise<string> {
  if (error instanceof AppError) return error.message

  // Edge Function hataları — gövdedeki {error} bizim Türkçe mesajımızdır.
  if (isFunctionsHttpError(error)) {
    const status = error.context.status
    try {
      const body = (await error.context.clone().json()) as { error?: string }
      if (body?.error) return body.error
    } catch {
      /* gövde okunamadı */
    }
    if (status === 401) return 'Oturumunuz doğrulanamadı. Lütfen yeniden giriş yapın.'
    if (status === 403) return 'Bu işlem için yetkiniz yok.'
    if (status === 404) return 'Kayıt bulunamadı.'
    return 'İşlem tamamlanamadı. Lütfen tekrar deneyin.'
  }

  const code = (error as { code?: string } | null)?.code
  const msg = (error as { message?: string } | null)?.message ?? ''

  if (code) {
    if (code === '42501') {
      // RLS/izin reddi (İngilizce) vs bizim özel trigger mesajımız (Türkçe)
      if (ENGLISH_JARGON.test(msg)) return 'Bu işlem için yetkiniz yok.'
      return msg || 'Bu işlem için yetkiniz yok.'
    }
    // Bizim özel RAISE'lerimiz (append-only, sistem rolü, kod alanı vb.) Türkçedir.
    if (code === '2F000' || code === 'P0001' || code === '2BP01') {
      return msg && !ENGLISH_JARGON.test(msg) ? msg : 'Bu işlem gerçekleştirilemez.'
    }
    if (PG_CODE_MESSAGES[code]) return PG_CODE_MESSAGES[code]
  }

  // Türkçe ve anlamlı bir mesajsa doğrudan göster; İngilizce SQL jargonu ise gizle.
  if (msg && !ENGLISH_JARGON.test(msg)) return msg
  return 'İşlem tamamlanamadı. Lütfen tekrar deneyin.'
}

/**
 * PostgREST UPDATE/DELETE sonucunu denetler. Hata varsa fırlatır; 0 satır
 * etkilendiyse (RLS sessiz reddi ya da kayıt yok) GÖRÜNÜR bir hataya çevirir.
 * Kullanım: mutation'da `.update(...).eq(...).select('id')` sonrası.
 */
export function ensureRows<T>(result: { data: T[] | null; error: unknown }): T[] {
  if (result.error) throw result.error
  if (!result.data || result.data.length === 0) {
    throw new AppError('İşlem yapılamadı: bu kaydı değiştirme yetkiniz yok ya da kayıt bulunamadı.')
  }
  return result.data
}
