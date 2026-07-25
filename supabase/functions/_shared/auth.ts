// Ortak kimlik/yetki yardımcıları (Deno / Supabase Edge Functions).
//
// GÜVENLİK MODELİ:
//   * verify_jwt = true → fonksiyon yalnızca geçerli JWT ile çalışır.
//   * Çağıranın kimliği anon key + Authorization başlığı ile doğrulanır.
//   * Yetki kontrolü ÇAĞIRANIN ROLÜ ile yapılır. has_permission() KULLANILMAZ:
//     Faz 0'da o fonksiyon her aktif kullanıcıya true döner; kullanıcı yönetimi
//     için bu yetersizdir. Rol service_role ile (RLS'siz) okunur.
//   * Ayrıcalıklı işlemler service_role ile yapılır; bu anahtar YALNIZCA Edge
//     runtime'ında (Supabase secrets) bulunur, frontend'e asla gitmez.
//   * İstemciden gelen hiçbir yetki/rol iddiasına güvenilmez.
import {
  createClient,
  type SupabaseClient,
  type User,
} from 'npm:@supabase/supabase-js@2'

/** Kullanıcı yönetimi işlemlerine izinli roller. */
export const USER_MANAGEMENT_ROLES = ['owner', 'admin'] as const

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new HttpError(500, `Eksik ortam değişkeni: ${name}`)
  return value
}

/** service_role istemcisi — RLS'i baypas eder. Yalnızca sunucu tarafı. */
export function adminClient(): SupabaseClient {
  return createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

/** Çağıranın oturumu bağlamında çalışan istemci (anon key + gelen JWT). */
function callerClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get('Authorization') ?? ''
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export interface Caller {
  user: User
  roleId: number | null
  roleKey: string | null
}

/** role_id → rol anahtarı (service_role ile; FK embed'ine bağımlı değil). */
export async function roleKeyOf(
  admin: SupabaseClient,
  roleId: number | null,
): Promise<string | null> {
  if (roleId == null) return null
  const { data, error } = await admin
    .from('roles')
    .select('key')
    .eq('id', roleId)
    .maybeSingle()
  if (error) throw new HttpError(500, 'Rol çözümlenemedi.')
  return data?.key ?? null
}

/**
 * Çağıranı doğrular: geçerli oturum + AKTİF, silinmemiş kullanıcı. Rolünü
 * (service_role ile) çözüp döner. Yetki KARARINI vermez — onu requireRole yapar.
 */
export async function authenticateCaller(req: Request): Promise<Caller> {
  const supa = callerClient(req)

  const {
    data: { user },
    error,
  } = await supa.auth.getUser()
  if (error || !user) throw new HttpError(401, 'Oturum doğrulanamadı.')

  const admin = adminClient()
  const { data: row, error: rowError } = await admin
    .from('users')
    .select('is_active, deleted_at, role_id')
    .eq('id', user.id)
    .maybeSingle()
  if (rowError) throw new HttpError(500, 'Yetki doğrulanamadı.')
  if (!row || row.is_active !== true || row.deleted_at !== null) {
    throw new HttpError(403, 'Bu işlem için yetkiniz yok.')
  }

  const roleId = (row.role_id as number | null) ?? null
  const roleKey = await roleKeyOf(admin, roleId)
  return { user, roleId, roleKey }
}

/** Çağıranın rolü izinli listede değilse 403. */
export function requireRole(caller: Caller, allowed: readonly string[]): void {
  if (!caller.roleKey || !allowed.includes(caller.roleKey)) {
    throw new HttpError(403, 'Bu işlem için yetkiniz yok.')
  }
}
