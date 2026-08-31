// whatsapp-send — CRM'den WhatsApp mesajı gönder (Twilio) ve kaydını tut.
//
// teklead'in twilio-send-wa'sından FARKI: orası yalnız Twilio'ya iletiyordu, kayıt
// başka yerde tutuluyordu. Burada gönderim ve kayıt TEK işlemde: konuşma bulunur/açılır,
// mesaj `messages`'a yazılır, Twilio çağrılır, sonuç aynı satıra işlenir. Böylece
// Twilio başarılı olup kayıt düşmesi (ya da tersi) mümkün olmuyor.
//
// İki mod:
//   • Şablon:    { entity_type, entity_id, content_sid, variables? }
//   • Serbest:   { entity_type, entity_id, text, media_urls? }
//     Serbest metin yalnız 24 saatlik "müşteri hizmetleri penceresi" içinde geçerlidir
//     (müşteri son 24 saatte yazmışsa). Pencere kapalıysa Twilio reddeder; kaydı
//     `basarisiz` olarak tutuyoruz ki neden gitmediği görünsün.
//
// Yetki: oturum + messages.send izni. verify_jwt = true.
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { authenticateCaller, HttpError } from '../_shared/auth.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TWILIO_API = 'https://api.twilio.com/2010-04-01'

interface Body {
  entity_type: 'lead' | 'customer'
  entity_id: number
  to?: string
  content_sid?: string
  variables?: Record<string, string>
  text?: string
  media_urls?: string[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  const sid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')
  const from = Deno.env.get('TWILIO_WHATSAPP_FROM')
  if (!sid || !token || !from) return jsonResponse({ error: 'twilio_yapilandirilmamis' }, 503)

  let caller
  try {
    caller = await authenticateCaller(req)
  } catch (e) {
    const err = e as HttpError
    return jsonResponse({ error: err.message }, err.status ?? 401)
  }

  // ÇAĞIRANIN oturumuyla çalışıyoruz — service_role DEĞİL. Böylece has_permission()
  // ve RLS doğal olarak işler: messages.send izni olmayan kullanıcının insert'i
  // politikadan geçemez. Yetki kontrolünü ikinci kez elle yazmıyoruz.
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
  )

  const { data: izinli } = await db.rpc('has_permission', { permission_key: 'messages.send' })
  if (izinli !== true) return jsonResponse({ error: 'yetki_yok' }, 403)

  let body: Body
  try { body = await req.json() } catch { return jsonResponse({ error: 'invalid_json' }, 400) }
  if (!body.entity_type || !body.entity_id) return jsonResponse({ error: 'entity_type ve entity_id gerekli' }, 400)

  const hasTemplate = !!body.content_sid
  const hasText = !!body.text?.trim()
  const media = (body.media_urls ?? []).filter((u) => typeof u === 'string' && u)
  if (!hasTemplate && !hasText && !media.length) {
    return jsonResponse({ error: 'content_sid, text veya media_urls gerekli' }, 400)
  }

  // ---- 1) Alıcı numarası: verilmemişse birincil telefondan bulunur ----
  let to = body.to?.trim()
  if (!to) {
    const { data: cp } = await db.from('contact_points')
      .select('value').eq('entity_type', body.entity_type).eq('entity_id', body.entity_id)
      .eq('type', 'phone').order('is_primary', { ascending: false }).limit(1).maybeSingle()
    to = cp?.value as string | undefined
  }
  if (!to) return jsonResponse({ error: 'alici_telefonu_yok' }, 400)

  // ---- 2) Konuşmayı bul ya da aç (kişi+kanalda tek AÇIK konuşma kısıtı var) ----
  const { data: kanal } = await db.from('interaction_channels').select('id').eq('key', 'whatsapp').single()
  let { data: konusma } = await db.from('conversations').select('id')
    .eq('entity_type', body.entity_type).eq('entity_id', body.entity_id)
    .eq('channel_id', kanal!.id).eq('is_archived', false).maybeSingle()
  if (!konusma) {
    const { data: yeni, error } = await db.from('conversations')
      .insert({ entity_type: body.entity_type, entity_id: body.entity_id, channel_id: kanal!.id, peer_identifier: to })
      .select('id').single()
    if (error) return jsonResponse({ error: 'konusma_acilamadi', detail: error.message }, 500)
    konusma = yeni
  }

  // ---- 3) Mesajı ÖNCE kuyrukta olarak yaz (Twilio'ya gidip kayıt düşmesin) ----
  const { data: msj, error: msjErr } = await db.from('messages').insert({
    conversation_id: konusma!.id, direction: 'outbound', status: 'kuyrukta',
    body: body.text ?? null, template_variables: body.variables ?? null,
    provider: 'twilio', sent_by: caller.user.id,
    media_url: media[0] ?? null,
  }).select('id').single()
  if (msjErr) return jsonResponse({ error: 'mesaj_kaydedilemedi', detail: msjErr.message }, 500)

  // ---- 4) Twilio ----
  const form = new URLSearchParams()
  form.set('To', to.startsWith('whatsapp:') ? to : `whatsapp:${to}`)
  form.set('From', from)
  if (hasTemplate) {
    form.set('ContentSid', body.content_sid!)
    if (body.variables && Object.keys(body.variables).length) {
      form.set('ContentVariables', JSON.stringify(body.variables))
    }
  } else {
    if (hasText) form.set('Body', body.text!.trim())
    media.slice(0, 10).forEach((u) => form.append('MediaUrl', u))
  }

  const res = await fetch(`${TWILIO_API}/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  })
  const cikti = await res.json().catch(() => ({}))

  // ---- 5) Sonucu aynı satıra işle ----
  const basarili = res.ok && !cikti.error_code
  await db.from('messages').update(
    basarili
      ? { status: 'gonderildi', provider_message_id: cikti.sid ?? null, provider_response: cikti, sent_at: new Date().toISOString() }
      : { status: 'basarisiz', provider_response: cikti, error_code: String(cikti.code ?? res.status), error_message: cikti.message ?? 'Twilio hatası', failed_at: new Date().toISOString() },
  ).eq('id', msj.id)

  return jsonResponse(
    basarili
      ? { ok: true, message_id: msj.id, conversation_id: konusma!.id, provider_message_id: cikti.sid }
      : { ok: false, message_id: msj.id, error: cikti.message ?? 'gonderilemedi', code: cikti.code ?? res.status },
    basarili ? 201 : 502,
  )
})
