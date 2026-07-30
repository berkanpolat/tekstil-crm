// intake-request — tekstilas.com talep ucu (E.1/E.3).
// İnce sarmalayıcı: gizli-anahtar doğrula → intake_process RPC (tüm iş mantığı
// DB'de, test edilebilir) → dosyaları indir/çöz + Storage'a yükle + operasyona bağla.
// verify_jwt = false; X-Intake-Secret ile korunur. Bir adım patlasa da talep oluşur.
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { adminClient } from '../_shared/auth.ts'

const HEADERS = { ...corsHeaders, 'Access-Control-Allow-Headers': corsHeaders['Access-Control-Allow-Headers'] + ', x-intake-secret' }

async function sha256(buf: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// data:...;base64,XXXX → {bytes, mime, ext}
function decodeDataUrl(s: string): { bytes: Uint8Array; mime: string; ext: string } | null {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(s.trim())
  if (!m) return null
  const mime = m[1] || 'application/octet-stream'
  const bin = atob(m[2])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const ext = mime.split('/')[1]?.split('+')[0] || 'bin'
  return { bytes, mime, ext }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: HEADERS })
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  const secret = Deno.env.get('INTAKE_SECRET')
  if (!secret || req.headers.get('x-intake-secret') !== secret) return jsonResponse({ error: 'unauthorized' }, 401)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return jsonResponse({ error: 'invalid_json' }, 400) }

  const db = adminClient()

  // ---- 1) İş mantığı: RPC (eşleştir/lead-çevir/operasyon/katalog/taslak-teklif) ----
  const { data: res, error: rpcErr } = await db.rpc('intake_process', { p: body })
  if (rpcErr) return jsonResponse({ ok: false, error: 'intake_failed', detail: rpcErr.message }, 500)
  const out = res as { ok: boolean; code?: string; operation_id?: number; idempotent?: boolean; error?: string }
  if (!out?.ok) return jsonResponse(out, 400)
  const opId = out.operation_id!
  if (out.idempotent) return jsonResponse(out, 200) // ikinci kez → dosya tekrar işlenmez

  // ---- 2) Dosyalar (E.3): file_url indir / image_base64 çöz → Storage ----
  const maxMb = Number((await db.from('settings').select('value').eq('key', 'intake.max_file_mb').maybeSingle()).data?.value ?? 50)
  const maxBytes = maxMb * 1024 * 1024
  const notes: string[] = []
  let filesSaved = 0

  async function store(bytes: Uint8Array, name: string, mime: string) {
    const path = `intake/${opId}/${crypto.randomUUID()}-${name}`.slice(0, 200)
    const up = await db.storage.from('documents').upload(path, bytes, { contentType: mime })
    if (up.error) { notes.push(`dosya yüklenemedi: ${name}`); return }
    await db.from('files').insert({
      bucket: 'documents', storage_path: path, original_name: name, mime_type: mime,
      size_bytes: bytes.byteLength, checksum: await sha256(bytes),
      category: mime.startsWith('image/') ? 'image' : 'document',   // görsel → image (liste önizlemesi bunu arar)
      entity_type: 'operation', entity_id: String(opId),
    })
    filesSaved++
  }

  // 2a) Büyük dosya URL ile (tercih edilen)
  const fileUrl = (body.file_url as string | undefined)?.trim()
  if (fileUrl) {
    try {
      const r = await fetch(fileUrl)
      if (!r.ok) throw new Error(`http ${r.status}`)
      const bytes = new Uint8Array(await r.arrayBuffer())
      if (bytes.byteLength > maxBytes) notes.push(`dosya ${maxMb}MB sınırını aştı, atlandı: ${fileUrl}`)
      else await store(bytes, fileUrl.split('/').pop()?.split('?')[0] || 'ek', r.headers.get('content-type') ?? 'application/octet-stream')
    } catch (e) {
      // İndirme başarısız → operasyon notuna yazılır (aşağıda); talep yine oluşur.
      notes.push(`dosya indirilemedi: ${fileUrl} (${e instanceof Error ? e.message : 'hata'})`)
    }
  }

  // 2b) Küçük görsel base64 (geriye dönük destek)
  const b64 = (body.image_base64 as string | undefined)?.trim()
  if (b64) {
    const dec = decodeDataUrl(b64)
    if (!dec) notes.push('image_base64 çözülemedi')
    else if (dec.bytes.byteLength > maxBytes) notes.push(`görsel ${maxMb}MB sınırını aştı, atlandı`)
    else await store(dec.bytes, `gorsel.${dec.ext}`, dec.mime)
  }

  // ---- 3) Sorun varsa nota yaz (talep yine oluştu, kayıp yok) ----
  if (notes.length) {
    const { data: op } = await db.from('operations').select('description').eq('id', opId).maybeSingle()
    await db.from('operations').update({ description: `${op?.description ?? ''}\n[Ek uyarıları] ${notes.join(' | ')}` }).eq('id', opId)
  }

  return jsonResponse({ ok: true, code: out.code, operation_id: opId, files_saved: filesSaved, warnings: notes }, 201)
})
