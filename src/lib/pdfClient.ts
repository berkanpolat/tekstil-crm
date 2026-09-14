// Belge servisi (PDF) istemci köprüsü — v1.45.2.
//
// GÜVENLİK: PDF servisi /render ve /preview uçları `x-pdf-secret` ister. Bu secret
// İSTEMCİYE İNMEZ; ÜRETİMDE tarayıcı `generate-document` Edge Function'ını (Supabase JWT
// ile) çağırır, edge fn sunucu tarafında secret'ı ekleyip Fly'a iletir. Böylece:
//   • rol/RLS kapısı edge fn'de (authenticateCaller),
//   • secret yalnız Supabase secret olarak durur.
//
// YEREL GELİŞTİRME (import.meta.env.DEV): proxy ATLANIR; doğrudan env.pdfServiceUrl'e
// fetch edilir. Yereldeki PDF servisi development modda korumasız çalışır (v1.45.1), bu
// yüzden x-pdf-secret gerekmez. Böylece edge fn / Docker kurmadan yalnız
// "NODE_ENV=development node server.mjs" ile belge testi yapılabilir.
//
// NOT: /rates ve /rate-on-date AÇIK uçlardır — onlar doğrudan çağrılır (bkz. useDocuments),
// bu köprüden geçmez.
import { supabase } from './supabase'
import { env } from './env'

export interface PdfRenderBody { template: string; data: unknown; language: string }

/** FunctionsHttpError gövdesinden anlamlı mesaj çıkar (yoksa genel mesaj). */
async function pdfError(error: unknown): Promise<Error> {
  const ctx = (error as { context?: Response })?.context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.clone().json()
      if (body?.error) return new Error(String(body.error) + (body.status ? ` (${body.status})` : ''))
    } catch { /* JSON değil */ }
  }
  return new Error((error as Error)?.message || 'Belge servisi hatası.')
}

/** Yerel geliştirmede PDF servisine doğrudan istek (proxy'siz). */
async function directCall(endpoint: 'render' | 'preview', body: PdfRenderBody): Promise<Response> {
  return fetch(env.pdfServiceUrl.replace(/\/$/, '') + '/' + endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

/** Belge üret → PDF bytes. Üretim: proxy edge fn; yerel: doğrudan PDF servisi. */
export async function pdfRender(body: PdfRenderBody): Promise<Blob> {
  if (import.meta.env.DEV) {
    const res = await directCall('render', body)
    if (!res.ok) throw new Error(`PDF servisi hatası (${res.status}).`)
    return res.blob()
  }
  const { data, error } = await supabase.functions.invoke('generate-document', { body: { endpoint: 'render', ...body } })
  if (error) throw await pdfError(error)
  // Edge fn octet-stream döndürür → supabase-js invoke Blob olarak çözer.
  return data as Blob
}

/** Canlı önizleme → stilli HTML. Üretim: proxy edge fn; yerel: doğrudan PDF servisi. */
export async function pdfPreview(body: PdfRenderBody): Promise<string> {
  if (import.meta.env.DEV) {
    const res = await directCall('preview', body)
    if (!res.ok) throw new Error(`Önizleme hatası (${res.status}).`)
    return res.text()
  }
  const { data, error } = await supabase.functions.invoke('generate-document', { body: { endpoint: 'preview', ...body } })
  if (error) throw await pdfError(error)
  return data as string
}
