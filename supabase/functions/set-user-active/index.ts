// set-user-active — Yönetici (owner/admin) bir çalışanı pasifleştirir / aktifleştirir.
// Pasifleştirme: public.users.is_active=false (RLS artık her şeyi engeller) +
// auth kullanıcısı banlanır (girişi de kapatılır). Aktifleştirme tersi.
// Fiziksel/mantıksal SİLME değildir; kayıt korunur.
//
// Güvenlik:
//   * Yalnızca owner/admin.
//   * Kendini pasifleştirme engellidir.
//   * Owner''ı yalnızca owner pasifleştirebilir/aktifleştirebilir.
//   * Hata mesajları bilgi sızdırmaz.
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import {
  adminClient,
  authenticateCaller,
  requireRole,
  roleKeyOf,
  HttpError,
  USER_MANAGEMENT_ROLES,
} from '../_shared/auth.ts'

interface SetActiveBody {
  user_id: string
  is_active: boolean
}

// ~100 yıl: kalıcı ban etkisi.
const BAN_DURATION = '876000h'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Yalnızca POST kabul edilir.')

    const caller = await authenticateCaller(req)
    requireRole(caller, USER_MANAGEMENT_ROLES)

    const body = (await req.json()) as SetActiveBody
    if (!body.user_id || typeof body.is_active !== 'boolean') {
      throw new HttpError(400, 'Kullanıcı ve durum (is_active) zorunludur.')
    }
    if (body.user_id === caller.user.id && body.is_active === false) {
      throw new HttpError(400, 'Kendi hesabınızı pasifleştiremezsiniz.')
    }

    const admin = adminClient()

    // Hedef owner ise yalnızca owner işlem yapabilir.
    const { data: target, error: targetError } = await admin
      .from('users')
      .select('role_id')
      .eq('id', body.user_id)
      .maybeSingle()
    if (targetError) throw new HttpError(500, 'İşlem gerçekleştirilemedi.')
    if (!target) throw new HttpError(404, 'Kullanıcı bulunamadı.')
    const targetRoleKey = await roleKeyOf(admin, (target.role_id as number | null) ?? null)
    if (targetRoleKey === 'owner' && caller.roleKey !== 'owner') {
      throw new HttpError(403, 'Owner hesabı üzerinde yalnızca owner işlem yapabilir.')
    }

    const { error: profileError } = await admin
      .from('users')
      .update({ is_active: body.is_active })
      .eq('id', body.user_id)
    if (profileError) {
      console.error('set-user-active profile update failed:', profileError.message)
      throw new HttpError(400, 'İşlem gerçekleştirilemedi.')
    }

    const { error: banError } = await admin.auth.admin.updateUserById(body.user_id, {
      ban_duration: body.is_active ? 'none' : BAN_DURATION,
    })
    if (banError) {
      console.error('set-user-active ban update failed:', banError.message)
      throw new HttpError(400, 'İşlem gerçekleştirilemedi.')
    }

    return jsonResponse({ ok: true, is_active: body.is_active }, 200)
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status)
    }
    console.error('set-user-active unexpected error:', error)
    return jsonResponse({ error: 'Beklenmeyen bir hata oluştu.' }, 500)
  }
})
