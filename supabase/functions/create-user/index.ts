// create-user — Yönetici (owner/admin) tarafından çalışan oluşturma.
// service_role yalnızca burada (Edge runtime) kullanılır; frontend asla görmez.
//
// Güvenlik:
//   * Yetki, has_permission ile DEĞİL, çağıranın ROLÜ ile kontrol edilir
//     (yalnızca owner/admin).
//   * role_id sunucuda doğrulanır: owner rolünü yalnızca owner atayabilir.
//   * app_metadata (created_by_admin/role_id/created_by) SUNUCU tarafından
//     doldurulur; istemci değerine güvenilmez.
//   * Profil + rol TEK insert''te handle_new_user() ile yazılır (rollback yok).
//   * Hata mesajları bilgi sızdırmaz (e-posta var/yok gibi); detay loga gider.
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import {
  adminClient,
  authenticateCaller,
  requireRole,
  roleKeyOf,
  HttpError,
  USER_MANAGEMENT_ROLES,
} from '../_shared/auth.ts'

interface CreateUserBody {
  email: string
  password: string
  full_name: string
  role_id?: number | null
  department_id?: number | null
  position_id?: number | null
  phone?: string | null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Yalnızca POST kabul edilir.')

    // Çağıran owner/admin mi?
    const caller = await authenticateCaller(req)
    requireRole(caller, USER_MANAGEMENT_ROLES)

    const body = (await req.json()) as CreateUserBody
    const email = body.email?.trim().toLowerCase()
    if (!email || !body.password || !body.full_name?.trim()) {
      throw new HttpError(400, 'E-posta, şifre ve ad soyad zorunludur.')
    }
    if (body.password.length < 8) {
      throw new HttpError(400, 'Şifre en az 8 karakter olmalıdır.')
    }

    const admin = adminClient()

    // role_id doğrulaması: geçerli mi + owner rolü yalnızca owner tarafından
    const requestedRoleId = body.role_id ?? null
    if (requestedRoleId != null) {
      const requestedRoleKey = await roleKeyOf(admin, requestedRoleId)
      if (!requestedRoleKey) throw new HttpError(400, 'Geçersiz rol.')
      if (requestedRoleKey === 'owner' && caller.roleKey !== 'owner') {
        throw new HttpError(403, 'Owner rolünü yalnızca owner atayabilir.')
      }
    }

    // Tek adımda oluştur: handle_new_user() profili+rolü tek insert''te yazar.
    // Profil alanları user_metadata (yetki dışı), yetki alanları app_metadata.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: body.password,
      email_confirm: true,
      user_metadata: {
        full_name: body.full_name.trim(),
        phone: body.phone ?? null,
        department_id: body.department_id ?? null,
        position_id: body.position_id ?? null,
      },
      app_metadata: {
        created_by_admin: true,
        role_id: requestedRoleId,
        created_by: caller.user.id,
      },
    })

    if (createError || !created.user) {
      // Detayı loga yaz, dışarıya GENEL mesaj (e-posta enumerasyonunu önle).
      console.error('create-user failed:', createError?.message)
      throw new HttpError(400, 'Kullanıcı oluşturulamadı. Bilgileri kontrol edin.')
    }

    return jsonResponse({ id: created.user.id }, 201)
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status)
    }
    console.error('create-user unexpected error:', error)
    return jsonResponse({ error: 'Beklenmeyen bir hata oluştu.' }, 500)
  }
})
