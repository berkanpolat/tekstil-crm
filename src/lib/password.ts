// İstemci-tarafı parola kuralı — Supabase auth politikasıyla HİZALI olmalı
// (supabase/config.toml → minimum_password_length + password_requirements).
// Sunucu min 12 + letters_digits reddettiği için istemci de aynısını dayatır;
// aksi halde kullanıcı geçerli sandığı şifrede sunucudan ret alır.

export const MIN_PASSWORD_LENGTH = 12

/** Parola ipucu metni (form alanı hint'lerinde ortak kullanım). */
export const PASSWORD_HINT = `En az ${MIN_PASSWORD_LENGTH} karakter, harf ve rakam içermeli.`

/**
 * Geçersizse Türkçe hata metni, geçerliyse null döner.
 * Kural: en az MIN_PASSWORD_LENGTH karakter + en az bir harf ve bir rakam.
 */
export function passwordError(pw: string): string | null {
  if (pw.length < MIN_PASSWORD_LENGTH) return `En az ${MIN_PASSWORD_LENGTH} karakter olmalı.`
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'En az bir harf ve bir rakam içermeli.'
  return null
}
