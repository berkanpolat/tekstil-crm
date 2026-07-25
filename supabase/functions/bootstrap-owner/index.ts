// bootstrap-owner — Sistemin İLK kullanıcısını (owner) oluşturur.
// Self-signup platform seviyesinde kapalı olduğu için owner da normal yoldan
// kayıt olamaz; bu tek-kullanımlık uç onu kurar.
//
// Güvenlik (kimliksiz uç olduğu için katmanlı):
//   * verify_jwt = false (henüz kullanıcı/oturum yok).
//   * X-Bootstrap-Secret header'ı Supabase secrets'taki BOOTSTRAP_SECRET ile
//     eşleşmeli; aksi halde 403.
//   * public.users boş DEĞİLSE 403 (tek kullanımlık — ikinci kez çalışmaz).
//   * Owner rolü + must_change_password=false trigger'ın count=0 yoluyla atanır.
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { adminClient, HttpError } from '../_shared/auth.ts'

interface BootstrapBody {
  email: string
  password: string
  full_name: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Yalnızca POST kabul edilir.')

    const expected = Deno.env.get('BOOTSTRAP_SECRET') ?? ''
    const provided = req.headers.get('X-Bootstrap-Secret') ?? ''
    if (!expected || provided !== expected) {
      throw new HttpError(403, 'Yetkisiz.')
    }

    const admin = adminClient()

    // Zaten kurulmuş mu? (tek kullanımlık)
    const { count, error: countError } = await admin
      .from('users')
      .select('id', { count: 'exact', head: true })
    if (countError) throw new HttpError(500, 'Durum kontrol edilemedi.')
    if ((count ?? 0) > 0) {
      throw new HttpError(403, 'Sistem zaten kurulmuş.')
    }

    const body = (await req.json()) as BootstrapBody
    const email = body.email?.trim().toLowerCase()
    if (!email || !body.password || !body.full_name?.trim()) {
      throw new HttpError(400, 'E-posta, şifre ve ad soyad zorunludur.')
    }
    if (body.password.length < 8) {
      throw new HttpError(400, 'Şifre en az 8 karakter olmalıdır.')
    }

    // İlk kullanıcı → handle_new_user (count=0) owner + must_change_password=false atar.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: body.full_name.trim(), created_by_admin: true },
    })
    if (createError || !created.user) {
      console.error('bootstrap-owner failed:', createError?.message)
      throw new HttpError(400, 'Owner oluşturulamadı.')
    }

    return jsonResponse({ id: created.user.id, email }, 201)
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status)
    }
    console.error('bootstrap-owner unexpected error:', error)
    return jsonResponse({ error: 'Beklenmeyen bir hata oluştu.' }, 500)
  }
})
