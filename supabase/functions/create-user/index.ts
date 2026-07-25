// create-user — Yönetici (owner/admin) tarafından çalışan oluşturma (İKİ ADIMLI).
//
// GoTrue admin.createUser'a gönderilen app_metadata, AFTER INSERT trigger'ına
// görünmediği için (bkz. docs), yetki/profil alanları trigger'da DEĞİL, burada
// insert SONRASI service_role UPDATE ile yazılır (fail-closed):
//   1) admin.createUser (user_metadata: full_name + created_by_admin=true yedek kilit)
//   2) users satırını UPDATE: role_id, department_id, position_id, phone,
//      created_by, must_change_password
//   UPDATE başarısızsa kullanıcı BAN'lanır (deleteUser FK restrict yüzünden
//   çalışmaz) ve hata döner → rolsüz/yarım kullanıcı kalmaz (güvenli durum).
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

const BAN_DURATION = '876000h'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Yalnızca POST kabul edilir.')

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

    // 1) Auth kullanıcısı. created_by_admin YEDEK kilit için user_metadata'da
    //    (app_metadata insert'te trigger'a görünmüyor). role_id burada YOK —
    //    metadata forge edilse bile yetki sızmasın diye adım 2'de yazılır.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: body.full_name.trim(), created_by_admin: true },
    })
    if (createError || !created.user) {
      console.error('create-user step1 failed:', createError?.message)
      throw new HttpError(400, 'Kullanıcı oluşturulamadı. Bilgileri kontrol edin.')
    }

    const userId = created.user.id

    // 2) Yetki + profil alanlarını service_role ile yaz (trigger role_id=null bıraktı).
    const { error: updateError } = await admin
      .from('users')
      .update({
        role_id: requestedRoleId,
        department_id: body.department_id ?? null,
        position_id: body.position_id ?? null,
        phone: body.phone ?? null,
        created_by: caller.user.id,
        must_change_password: true,
      })
      .eq('id', userId)

    if (updateError) {
      // FAIL-CLOSED: yapılandırılamayan kullanıcıyı askıya al (ban), sil DEĞİL.
      console.error('create-user step2 update failed:', updateError.message)
      await admin.auth.admin.updateUserById(userId, { ban_duration: BAN_DURATION })
      throw new HttpError(
        500,
        'Kullanıcı oluşturuldu ancak yapılandırılamadı; hesap askıya alındı. Yöneticiye başvurun.',
      )
    }

    return jsonResponse({ id: userId }, 201)
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status)
    }
    console.error('create-user unexpected error:', error)
    return jsonResponse({ error: 'Beklenmeyen bir hata oluştu.' }, 500)
  }
})
