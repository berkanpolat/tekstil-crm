import { createClient } from '@supabase/supabase-js'
import { env } from './env'
import type { Database } from './database.types'

/**
 * Uygulama genelinde tek Supabase istemcisi. Tipler supabase gen types ile
 * uretilecek (bkz. scripts/gen-types); Faz 0'da sema kuruldukca guncellenir.
 */
export const supabase = createClient<Database>(
  env.supabaseUrl || 'http://localhost',
  env.supabaseAnonKey || 'public-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
