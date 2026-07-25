/**
 * Ortam degiskenlerinin tek erisim noktasi. Uygulama kodu import.meta.env'e
 * dogrudan dokunmaz; buradan okur. Boylece eksik degisken tek yerde yakalanir.
 */

interface AppEnv {
  supabaseUrl: string
  supabaseAnonKey: string
  /** true = geliştirme, uygulama gercek entegrasyonlara baglanmaz varsayilani. */
  isDev: boolean
}

function read(key: string): string {
  const value = import.meta.env[key]
  return typeof value === 'string' ? value : ''
}

export const env: AppEnv = {
  supabaseUrl: read('VITE_SUPABASE_URL'),
  supabaseAnonKey: read('VITE_SUPABASE_ANON_KEY'),
  isDev: import.meta.env.DEV,
}

/** Supabase baglantisi icin gerekli degiskenler tanimli mi? */
export const hasSupabaseConfig = Boolean(env.supabaseUrl && env.supabaseAnonKey)

if (import.meta.env.DEV && !hasSupabaseConfig) {
  // Faz 0'da kimlik dogrulama gelene kadar giris sayfasi da olsa uyaralim.
  console.warn(
    '[env] VITE_SUPABASE_URL veya VITE_SUPABASE_ANON_KEY tanimli degil. ' +
      '.env dosyanizi .env.example uzerinden olusturun.',
  )
}
