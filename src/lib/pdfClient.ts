// Belge servisi (PDF) istemci köprüsü — v1.45.0.
//
// GÜVENLİK: PDF servisi /render ve /preview uçları `x-pdf-secret` ister. Bu secret
// İSTEMCİYE İNMEZ; tarayıcı `generate-document` Edge Function'ını (Supabase JWT ile)
// çağırır, edge fn sunucu tarafında secret'ı ekleyip Fly'a iletir. Böylece:
//   • rol/RLS kapısı edge fn'de (authenticateCaller),
//   • secret yalnız Supabase secret olarak durur.
// NOT: /rates ve /rate-on-date AÇIK uçlardır — onlar doğrudan çağrılır (bkz. useDocuments),
// bu köprüden geçmez.
import { supabase } from './supabase'

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

/** Belge üret (proxy → PDF bytes). */
export async function pdfRender(body: PdfRenderBody): Promise<Blob> {
  const { data, error } = await supabase.functions.invoke('generate-document', { body: { endpoint: 'render', ...body } })
  if (error) throw await pdfError(error)
  // Edge fn octet-stream döndürür → supabase-js invoke Blob olarak çözer.
  return data as Blob
}

/** Canlı önizleme (proxy → stilli HTML). */
export async function pdfPreview(body: PdfRenderBody): Promise<string> {
  const { data, error } = await supabase.functions.invoke('generate-document', { body: { endpoint: 'preview', ...body } })
  if (error) throw await pdfError(error)
  return data as string
}
