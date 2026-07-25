/**
 * Operasyon kodu — SAF mantık (format + alfabe). Otoriter üretici Postgres'teki
 * generate_operation_code()'dur (code_registry ile eşzamanlı-güvenli benzersizlik).
 * Buradaki yardımcılar istemci tarafı doğrulama/önizleme içindir.
 *
 * Alfabe karışan karakterleri (I, O, 0, 1) DIŞLAR — kod telefonda okunur.
 */
export const OPERATION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const OPERATION_CODE_FORBIDDEN = ['I', 'O', '0', '1'] as const

export const DEFAULT_CODE_PREFIX = 'TAS'
export const DEFAULT_CODE_LENGTH = 6

/** Verilen önek/uzunluk için geçerli kod deseni. */
export function operationCodePattern(prefix = DEFAULT_CODE_PREFIX, length = DEFAULT_CODE_LENGTH): RegExp {
  return new RegExp(`^${prefix}-[${OPERATION_CODE_ALPHABET}]{${length}}$`)
}

/** Bir kodun formatı geçerli mi (önek, ayraç, alfabe, uzunluk)? */
export function isValidOperationCode(
  code: string,
  prefix = DEFAULT_CODE_PREFIX,
  length = DEFAULT_CODE_LENGTH,
): boolean {
  return operationCodePattern(prefix, length).test(code)
}

/**
 * İstemci tarafı rastgele kod (önizleme/placeholder). Kriptografik rastgelelik
 * (crypto.getRandomValues) kullanır ama BENZERSİZLİK GARANTİSİ YOKTUR — gerçek
 * kod Postgres üreticisinden alınır ve code_registry'de tekildir.
 */
export function randomOperationCode(
  prefix = DEFAULT_CODE_PREFIX,
  length = DEFAULT_CODE_LENGTH,
): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let code = ''
  for (let i = 0; i < length; i++) {
    code += OPERATION_CODE_ALPHABET[bytes[i]! % OPERATION_CODE_ALPHABET.length]
  }
  return `${prefix}-${code}`
}
