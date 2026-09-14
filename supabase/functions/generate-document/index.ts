// generate-document — Belge motoru PDF servisinin GÜVENLİ PROXY'si (v1.45.0).
//
// MİMARİ (tasarlanmış): tarayıcı buraya Supabase JWT ile gelir → rol/RLS kapısı burada
// (authenticateCaller). Edge fn, PDF servisinin istediği `x-pdf-secret` başlığını SUNUCU
// TARAFINDA ekleyip Fly'a iletir. Secret (PDF_SECRET) yalnız Supabase secret olarak durur,
// istemciye ASLA inmez. Yalnız `render` ve `preview` uçları geçer (SSRF'e kapalı: hedef URL
// sabit PDF_SERVICE_URL, uç beyaz listede).
import { corsHeaders } from '../_shared/cors.ts'
import { authenticateCaller, HttpError } from '../_shared/auth.ts'

const ALLOWED_ENDPOINTS = new Set(['render', 'preview'])

function requireEnv(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new HttpError(500, `Eksik ortam değişkeni: ${name}`)
  return v
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Yalnız POST.')

    // Kapı: geçerli JWT + AKTİF kullanıcı. Belge üretimi tüm aktif personele açıktır
    // (özel rol gerekmez); yalnız oturum + aktiflik doğrulanır.
    await authenticateCaller(req)

    const body = await req.json().catch(() => ({}))
    const endpoint = String(body?.endpoint ?? '')
    if (!ALLOWED_ENDPOINTS.has(endpoint)) throw new HttpError(400, 'Geçersiz uç nokta.')

    const base = requireEnv('PDF_SERVICE_URL').replace(/\/$/, '')
    const secret = requireEnv('PDF_SECRET')
    const forward = { template: body?.template, data: body?.data, language: body?.language ?? 'tr' }

    const upstream = await fetch(`${base}/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pdf-secret': secret },
      body: JSON.stringify(forward),
    })

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '')
      return new Response(
        JSON.stringify({ error: 'PDF servisi hatası', status: upstream.status, detail: detail.slice(0, 500) }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (endpoint === 'preview') {
      const html = await upstream.text()
      return new Response(html, { headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } })
    }
    // render → PDF bytes. octet-stream ki supabase-js functions.invoke Blob olarak çözsün.
    const buf = await upstream.arrayBuffer()
    return new Response(buf, { headers: { ...corsHeaders, 'Content-Type': 'application/octet-stream' } })
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Bilinmeyen hata' }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
