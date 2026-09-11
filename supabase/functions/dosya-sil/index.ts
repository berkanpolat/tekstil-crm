// dosya-sil — Dosya servisinin /s ucuna köprü.
//
// /s servis sırrı ister; sır tarayıcıya konamaz. Bu işlev çağıranın Supabase
// oturumunu doğrular (mevcut users tablosuna göre aktif kullanıcı mı), sonra
// servis sırrıyla Worker'a gider. RPC (customer_hard_delete vb.) DB satırlarını
// zaten silmiştir; burası yalnızca fiziksel nesneleri temizler.
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { authenticateCaller, HttpError } from '../_shared/auth.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    await authenticateCaller(req)

    const dosyaUrl = Deno.env.get('DOSYA_SERVIS_URL')
    const sir = Deno.env.get('DOSYA_SERVIS_SIRRI')
    if (!dosyaUrl || !sir) throw new HttpError(500, 'Yapılandırma eksik.')

    const govde = await req.json().catch(() => ({}) as { yollar?: unknown })
    const yollar = Array.isArray(govde.yollar)
      ? govde.yollar.filter((y): y is string => typeof y === 'string' && y.length > 0)
      : []
    if (!yollar.length) return jsonResponse({ ok: true, silinen: 0 })

    const r = await fetch(`${dosyaUrl}/s`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-servis-sirri': sir },
      body: JSON.stringify({ yollar }),
    })
    const metin = await r.text()
    return new Response(metin, {
      status: r.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    if (e instanceof HttpError) return jsonResponse({ error: e.message }, e.status)
    console.error('[dosya-sil]', e)
    return jsonResponse({ error: 'Silme isteği işlenemedi.' }, 500)
  }
})
