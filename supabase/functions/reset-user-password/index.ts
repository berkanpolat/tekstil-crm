// reset-user-password — Yönetici (owner/admin) bir çalışanın şifresini sıfırlar.
// Yeni şifreyi yönetici belirler; çalışan ilk girişte değiştirmek zorunda kalır.
//
// Güvenlik:
//   * Yalnızca owner/admin.
//   * Owner''ın şifresini yalnızca owner sıfırlayabilir (admin, owner hesabını
//     ele geçiremesin).
//   * Hata mesajları bilgi sızdırmaz.
//
// Not: Kullanıcının KENDİ isteğiyle e-posta ile sıfırlama service_role
// gerektirmez, frontend''de kalır (supabase.auth.resetPasswordForEmail).
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import {
  adminClient,
  authenticateCaller,
  requireRole,
  roleKeyOf,
  HttpError,
  USER_MANAGEMENT_ROLES,
} from '../_shared/auth.ts'

interface ResetPasswordBody {
  user_id: string
  new_password: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Yalnızca POST kabul edilir.')

    const caller = await authenticateCaller(req)
    requireRole(caller, USER_MANAGEMENT_ROLES)

    const body = (await req.json()) as ResetPasswordBody
    if (!body.user_id || !body.new_password) {
      throw new HttpError(400, 'Kullanıcı ve yeni şifre zorunludur.')
    }
    if (body.new_password.length < 8) {
      throw new HttpError(400, 'Şifre en az 8 karakter olmalıdır.')
    }

    const admin = adminClient()

    // Hedefin rolü owner ise yalnızca owner sıfırlayabilir.
    const { data: target, error: targetError } = await admin
      .from('users')
      .select('role_id')
      .eq('id', body.user_id)
      .maybeSingle()
    if (targetError) throw new HttpError(500, 'İşlem gerçekleştirilemedi.')
    if (!target) throw new HttpError(404, 'Kullanıcı bulunamadı.')
    const targetRoleKey = await roleKeyOf(admin, (target.role_id as number | null) ?? null)
    if (targetRoleKey === 'owner' && caller.roleKey !== 'owner') {
      throw new HttpError(403, 'Owner şifresini yalnızca owner sıfırlayabilir.')
    }

    const { error: pwError } = await admin.auth.admin.updateUserById(body.user_id, {
      password: body.new_password,
    })
    if (pwError) {
      console.error('reset-user-password failed:', pwError.message)
      throw new HttpError(400, 'Şifre sıfırlanamadı.')
    }

    const { error: flagError } = await admin
      .from('users')
      .update({ must_change_password: true })
      .eq('id', body.user_id)
    if (flagError) {
      console.error('reset-user-password flag update failed:', flagError.message)
      throw new HttpError(400, 'Şifre sıfırlanamadı.')
    }

    return jsonResponse({ ok: true }, 200)
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status)
    }
    console.error('reset-user-password unexpected error:', error)
    return jsonResponse({ error: 'Beklenmeyen bir hata oluştu.' }, 500)
  }
})
