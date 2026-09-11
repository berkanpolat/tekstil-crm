import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ensureRows } from '@/lib/errors'
import type { Database } from '@/lib/database.types'
import { dosyaUrl } from '@/lib/dosyaAdres'
import { kucukResimUret } from '@/lib/kucukResim'
import { oturumTazele } from '@/lib/dosyaOturum'
import { env } from '@/lib/env'

export type FileRow = Database['public']['Tables']['files']['Row']
export type FileCategory = Database['public']['Enums']['file_category']
/** 'documents'/'avatars' eski Supabase kovaları; 'r2' yeni dosya servisi. */
export type FileBucket = 'documents' | 'avatars' | 'r2'

/** Tek bir nesneyi dosya servisine yükler. Çerez yoksa bir kez tazeleyip dener. */
async function dosyaYukle(yol: string, govde: Blob, tip: string): Promise<void> {
  const gonder = () =>
    fetch(`${env.dosyaUrl}/y?yol=${encodeURIComponent(yol)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': tip },
      body: govde,
    })
  let r = await gonder()
  if (r.status === 401) {
    await oturumTazele()
    r = await gonder()
  }
  if (!r.ok) throw new Error(`Dosya yüklenemedi (${r.status}).`)
}

/**
 * Nesneleri (orijinal + küçükler) fiziksel siler.
 *
 * Worker'ın /s ucu servis sırrı ister ve sır tarayıcıya KONAMAZ; bu yüzden
 * çağrı `dosya-sil` kenar işlevinden geçer. O işlev Görev 8'de yazılıp
 * dağıtılacak — o zamana kadar bu çağrı sessizce başarısız olur (aşağıdaki
 * try/catch bilerek yutuyor). Kabul edilebilir: yalnız nadir bir hata
 * yolunda (files kaydı başarısız olduğunda) çalışır ve yetim nesneye
 * `files` kaydı olmadığı için hiçbir kullanıcı erişemez.
 */
export async function dosyalariSil(yollar: string[]): Promise<void> {
  const temiz = yollar.filter(Boolean)
  if (!temiz.length) return
  try {
    await supabase.functions.invoke('dosya-sil', { body: { yollar: temiz } })
  } catch {
    // sessiz geç
  }
}

/** Dosyanın SHA-256 sağlamasını hesaplar (mükerrer tespiti + bütünlük). */
async function sha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function extensionOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : 'bin'
}

export interface UploadFileInput {
  file: File
  bucket: FileBucket
  category: FileCategory
  entityType?: string | null
  entityId?: string | null
  description?: string | null
  /** Bir dosyanın yeni sürümü ise: eski dosyanın id'si. Zincire eklenir. */
  replacesFileId?: number | null
}

/**
 * Dosyayı Storage'a yükler ve files kaydını oluşturur. Sürüm zinciri, checksum
 * ve uploaded_by otomatik. Sonraki her faz bu hook'u kullanır.
 */
export function useUploadFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: UploadFileInput): Promise<FileRow> => {
      const { file, category } = input

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Oturum bulunamadı.')

      const checksum = await sha256(file)
      const path = `${category}/${crypto.randomUUID()}.${extensionOf(file.name)}`

      // Orijinal + iki küçük resim R2'ye. Küçükler üretilemezse (PDF, HEIC)
      // sessizce atlanır; Worker küçük bulamazsa orijinale düşer.
      await dosyaYukle(path, file, file.type || 'application/octet-stream')
      for (const boyut of [160, 480] as const) {
        const kucuk = await kucukResimUret(file, boyut)
        if (kucuk) await dosyaYukle(`k/${boyut}/${path}.webp`, kucuk, 'image/webp')
      }

      // Sürüm numarası: eski dosyanın üstüne +1
      let version = 1
      if (input.replacesFileId != null) {
        const prev = await supabase
          .from('files')
          .select('version')
          .eq('id', input.replacesFileId)
          .single()
        if (!prev.error && prev.data) version = prev.data.version + 1
      }

      const insert = await supabase
        .from('files')
        .insert({
          bucket: 'r2',
          storage_path: path,
          original_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
          checksum,
          category,
          entity_type: input.entityType ?? null,
          entity_id: input.entityId ?? null,
          description: input.description ?? null,
          version,
          replaces_file_id: input.replacesFileId ?? null,
          uploaded_by: user.id,
        })
        .select('*')
        .single()

      if (insert.error) {
        // files kaydı oluşmadıysa yarım nesneyi temizle (bkz. dosyalariSil JSDoc'u)
        await dosyalariSil([path])
        throw insert.error
      }
      return insert.data
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['files', row.entity_type, row.entity_id] })
    },
  })
}

/** Bir varlığa bağlı (silinmemiş) dosyaları listeler. */
export function useEntityFiles(entityType: string | null, entityId: string | null) {
  return useQuery({
    queryKey: ['files', entityType, entityId],
    enabled: !!entityType && !!entityId,
    queryFn: async (): Promise<FileRow[]> => {
      const { data, error } = await supabase
        .from('files')
        .select('*')
        .eq('entity_type', entityType as string)
        .eq('entity_id', entityId as string)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

/** Görsel dönüşümü. Artık yalnız `width` kullanılır (hazır boyuta yuvarlanır). */
export interface ImgTransform { width?: number; height?: number; resize?: 'cover' | 'contain' | 'fill' }

/**
 * Dosyanın adresi.
 *
 * ADI TARİHSELDİR: artık imza üretmez, KALICI adres döndürür. Kimlik oturum
 * çerezinde taşınır. Adı korunuyor çünkü ~20 tüketici bu adı çağırıyor.
 * `bucket` ve `expiresInSeconds` yok sayılır; imzasız adresin süresi yoktur.
 *
 * `dosyaUrl` yapılandırma eksikse ya da yol geçersizse boş dize döner
 * (bkz. dosyaAdres.ts). Burada — indirme/önizleme yolunda kullanıldığı için —
 * sessizce hiçbir şey yapmayan bir indirme, hata veren indirmeden daha kötü;
 * bu yüzden boş dizede Türkçe bir hata fırlatılır.
 */
export async function getSignedUrl(
  _bucket: FileBucket,
  path: string,
  _expiresInSeconds = 60,
  /** Verilirse indirilebilir URL (Content-Disposition: attachment; filename). */
  downloadName?: string,
  transform?: ImgTransform,
): Promise<string> {
  const url = dosyaUrl(path, { genislik: transform?.width, indirAdi: downloadName })
  if (!url) throw new Error('Dosya servisi kullanılamıyor ya da dosya yolu geçersiz.')
  return url
}

/**
 * Dosya adresi. Ağ isteği YOKTUR — imza yenileme derdi kalktı.
 *
 * `dosyaUrl` boş dize dönerse (yapılandırma eksik ya da yol geçersiz)
 * `data: undefined` döner — boş dize DEĞİL: `<img src="">` sayfanın
 * kendisine istek atar, bu istenmez.
 */
export function useSignedUrl(file: Pick<FileRow, 'bucket' | 'storage_path'> | null, transform?: ImgTransform) {
  const url = file ? dosyaUrl(file.storage_path, { genislik: transform?.width }) : ''
  return { data: url || undefined, isLoading: false, isError: false as const }
}

/** Dosyayı MANTIKSAL siler (deleted_at/deleted_by). Fiziksel silme yok. */
export function useDeleteFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: FileRow): Promise<void> => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      ensureRows(
        await supabase
          .from('files')
          .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
          .eq('id', file.id)
          .select('id'),
      )
    },
    onSuccess: (_data, file) => {
      qc.invalidateQueries({ queryKey: ['files', file.entity_type, file.entity_id] })
    },
  })
}

/** Resim/PDF önizlenebilir mi? */
export function isPreviewable(mimeType: string | null): boolean {
  if (!mimeType) return false
  return mimeType.startsWith('image/') || mimeType === 'application/pdf'
}
