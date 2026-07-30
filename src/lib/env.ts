/**
 * Ortam degiskenlerinin tek erisim noktasi. Uygulama kodu import.meta.env'e
 * dogrudan dokunmaz; buradan okur. Boylece eksik degisken tek yerde yakalanir.
 */

interface AppEnv {
  supabaseUrl: string
  supabaseAnonKey: string
  /** true = geliştirme, uygulama gercek entegrasyonlara baglanmaz varsayilani. */
  isDev: boolean
  /** Belge motoru PDF servisi (Faz 4A). Dev'de yerel; üretimde dağıtılan URL. */
  pdfServiceUrl: string
}

function read(key: string): string {
  const value = import.meta.env[key]
  return typeof value === 'string' ? value : ''
}

export const env: AppEnv = {
  supabaseUrl: read('VITE_SUPABASE_URL'),
  supabaseAnonKey: read('VITE_SUPABASE_ANON_KEY'),
  isDev: import.meta.env.DEV,
  // Dev'de yerel servis varsayılır; ÜRETİMDE değişken yoksa boş → belge motoru
  // devre dışı (Netlify gibi statik ortamda PDF servisi olmayabilir).
  pdfServiceUrl: read('VITE_PDF_SERVICE_URL') || (import.meta.env.DEV ? 'http://localhost:4046' : ''),
}

/** Supabase baglantisi icin gerekli degiskenler tanimli mi? */
export const hasSupabaseConfig = Boolean(env.supabaseUrl && env.supabaseAnonKey)

/** PDF/belge servisi bu ortamda yapılandırılmış mı? (yoksa belge üretimi kapalı) */
export const hasPdfService = Boolean(env.pdfServiceUrl)

/** Belge servisi yoksa kullanıcıya gösterilecek net mesaj (sessiz hata yerine). */
export const PDF_UNAVAILABLE = 'Belge servisi bu ortamda kullanılamıyor.'

if (import.meta.env.DEV && !hasSupabaseConfig) {
  // Faz 0'da kimlik dogrulama gelene kadar giris sayfasi da olsa uyaralim.
  console.warn(
    '[env] VITE_SUPABASE_URL veya VITE_SUPABASE_ANON_KEY tanimli degil. ' +
      '.env dosyanizi .env.example uzerinden olusturun.',
  )
}
