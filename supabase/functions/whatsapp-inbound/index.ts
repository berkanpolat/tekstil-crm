// whatsapp-inbound — gelen WhatsApp mesajını CRM'e yaz.
//
// İKİ AŞAMALI GEÇİŞ (talep girişindeki kalıbın aynısı):
//   Bugün: Twilio webhook'u teklead'e gidiyor; teklead bir KOPYASINI buraya iletiyor.
//          teklead bozulmaz, CRM gerçek zamanlı almaya başlar.
//   Sonra: Twilio konsolundaki webhook adresi buraya çevrilir, teklead'inki kapanır.
//   Bu sıra bozulursa mesaj kaybı olur — önce burası çalışır olmalı.
//
// Gövde (teklead'in ilettiği ya da Twilio'nun kendi form gönderimi):
//   { from, to?, body?, media_url?, media_type?, provider_message_id?, sent_at? }
//
// Korunma: X-Inbound-Secret başlığı (WHATSAPP_INBOUND_SECRET).
// verify_jwt = false — dışarıdan çağrılır.
//
// KİŞİ EŞLEŞTİRME: telefonun SON 10 HANESİ. Ülke kodu/biçim farkları (+90, 0090, 90)
// bu sayede sorun olmuyor — CRM'in her yerinde kullanılan kural.
// Eşleşme yoksa mesaj YİNE kaydedilir: `peer_identifier` dolu, kimliksiz bir konuşma
// açılır ve panelde "eşleşmemiş" olarak görünür. Mesaj asla düşmez.
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { adminClient } from '../_shared/auth.ts'

const HEADERS = {
  ...corsHeaders,
  'Access-Control-Allow-Headers': corsHeaders['Access-Control-Allow-Headers'] + ', x-inbound-secret',
}

const son10 = (s: string) => (s ?? '').replace(/\D/g, '').slice(-10)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: HEADERS })
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  const secret = Deno.env.get('WHATSAPP_INBOUND_SECRET')
  if (!secret || req.headers.get('x-inbound-secret') !== secret) {
    return jsonResponse({ error: 'unauthorized' }, 401)
  }

  let b: Record<string, unknown>
  try { b = await req.json() } catch { return jsonResponse({ error: 'invalid_json' }, 400) }

  const from = String(b.from ?? '').replace(/^whatsapp:/, '').trim()
  if (!from) return jsonResponse({ error: 'from_gerekli' }, 400)
  const tel = son10(from)
  if (tel.length !== 10) return jsonResponse({ error: 'gecersiz_telefon' }, 400)

  const db = adminClient()

  // ---- 1) Kimi ilgilendiriyor (indeksli RPC; müşteri lead'e üstün) ----
  const { data: bulunan } = await db.rpc('find_entity_by_phone', { p_phone: from })
  const hedef = (bulunan as { entity_type: string; entity_id: number }[] | null)?.[0] ?? null

  const { data: kanal } = await db.from('interaction_channels').select('id').eq('key', 'whatsapp').single()

  // ---- 2) Konuşmayı bul / aç ----
  let konusmaId: number | null = null
  if (hedef) {
    const { data: mevcut } = await db.from('conversations').select('id')
      .eq('entity_type', hedef.entity_type).eq('entity_id', hedef.entity_id)
      .eq('channel_id', kanal!.id).eq('is_archived', false).maybeSingle()
    konusmaId = mevcut?.id ?? null
    if (!konusmaId) {
      const { data: yeni, error } = await db.from('conversations').insert({
        entity_type: hedef.entity_type, entity_id: hedef.entity_id,
        channel_id: kanal!.id, peer_identifier: from,
      }).select('id').single()
      if (error) return jsonResponse({ error: 'konusma_acilamadi', detail: error.message }, 500)
      konusmaId = yeni.id
    }
  } else {
    // Eşleşmeyen numara: mesajı kaybetmemek için numaraya bağlı konuşma aranır.
    const { data: mevcut } = await db.from('conversations').select('id')
      .eq('peer_identifier', from).eq('channel_id', kanal!.id).eq('is_archived', false).maybeSingle()
    konusmaId = mevcut?.id ?? null
    if (!konusmaId) {
      // Kimliksiz konuşma açılamıyor (entity_type NOT NULL) → eşleşmeyeni bekleyen
      // lead olarak aç. Böylece mesaj kaydedilir ve panelde görünür.
      const { data: yeniLead, error: leadErr } = await db.from('leads').insert({
        company_name: `Eşleşmeyen WhatsApp ${from}`,
        status_id: (await db.from('lead_statuses').select('id').eq('key', 'yeni').single()).data!.id,
        external_source: 'whatsapp_eslesmeyen', external_id: tel,
      }).select('id').single()
      if (leadErr) return jsonResponse({ error: 'lead_acilamadi', detail: leadErr.message }, 500)
      await db.from('contact_points').insert({
        entity_type: 'lead', entity_id: yeniLead.id, type: 'phone', value: from,
        label: 'WhatsApp', is_primary: true,
      })
      const { data: yeni } = await db.from('conversations').insert({
        entity_type: 'lead', entity_id: yeniLead.id, channel_id: kanal!.id, peer_identifier: from,
      }).select('id').single()
      konusmaId = yeni!.id
    }
  }

  // ---- 3) Mesajı yaz (provider_message_id ile idempotent) ----
  const pid = b.provider_message_id ? String(b.provider_message_id) : null
  if (pid) {
    const { data: var_ } = await db.from('messages').select('id')
      .eq('provider', 'twilio').eq('provider_message_id', pid).maybeSingle()
    if (var_) return jsonResponse({ ok: true, message_id: var_.id, idempotent: true }, 200)
  }

  const { data: msj, error } = await db.from('messages').insert({
    conversation_id: konusmaId, direction: 'inbound', status: 'alindi',
    body: (b.body as string) ?? null,
    provider: 'twilio', provider_message_id: pid,
    media_url: (b.media_url as string) ?? null,
    media_type: (b.media_type as string) ?? null,
    created_at: (b.sent_at as string) ?? undefined,
  }).select('id').single()
  if (error) return jsonResponse({ error: 'mesaj_yazilamadi', detail: error.message }, 500)

  return jsonResponse({
    ok: true, message_id: msj.id, conversation_id: konusmaId,
    matched: !!hedef, entity_type: hedef?.entity_type ?? 'lead',
  }, 201)
})
