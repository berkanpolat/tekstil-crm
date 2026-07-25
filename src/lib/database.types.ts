/**
 * Supabase sema tipleri. Bu dosya ilerideki paketlerde
 *   supabase gen types typescript --linked > src/lib/database.types.ts
 * ile OTOMATIK uretilecek. Elle duzenlemeyin.
 *
 * Faz 0 iskeletinde henuz tablo olmadigi icin bos bir yer tutucu.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: Record<string, never>
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
