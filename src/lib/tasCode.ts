// TAS kod doğrulama — operasyon kodu ile aynı kural (generate_operation_code):
// önek TAS- + 6 karakter, alfabe A-Z/2-9 (karışan I, O, 0, 1 DIŞLANIR). Kod telefonda
// okunur, kolide basılı olur. Belge editörü elle giriş de bu kurala uymalı (A1).
export const TAS_PREFIX = 'TAS'
export const TAS_LEN = 6
export const TAS_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // I,O,0,1 yok
const RE_CHAR = /[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g

/** Kullanıcı girişini kod-gövdesine sıkıştırır: büyük harf, geçersiz karakter atılır, 6 ile sınırlı. */
export function sanitizeTasBody(input: string): string {
  const up = (input || '').toLocaleUpperCase('en-US')
  return (up.match(RE_CHAR) || []).join('').slice(0, TAS_LEN)
}

/** 6 karakterlik gövdeyi doğrular; hata metni veya null döner (boş = hata değil, "eksik"). */
export function validateTasBody(body: string): string | null {
  if (!body) return null // boş: zorunluluk çağıran yerde ele alınır
  if (body.length < TAS_LEN) return `Eksik: ${body.length}/${TAS_LEN} karakter`
  if (body.length > TAS_LEN) return `Fazla: ${TAS_LEN} karakter olmalı`
  for (const ch of body) if (!TAS_ALPHABET.includes(ch)) return `Geçersiz karakter: ${ch} (I, O, 0, 1 kullanılmaz)`
  return null
}

/** "TAS-XXXXXX" tam kod → 6 karakter gövde (öneki ve tireyi atar). */
export function tasBodyFromFull(full: string): string {
  if (!full) return ''
  const i = full.lastIndexOf('-')
  return sanitizeTasBody(i >= 0 ? full.slice(i + 1) : full)
}

/** 6 karakter gövde → "TAS-XXXXXX" tam kod (gövde 6 değilse boş). */
export function tasFull(body: string): string {
  return body && body.length === TAS_LEN ? `${TAS_PREFIX}-${body}` : ''
}
