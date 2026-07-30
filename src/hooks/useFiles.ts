import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ensureRows } from '@/lib/errors'
import type { Database } from '@/lib/database.types'

export type FileRow = Database['public']['Tables']['files']['Row']
export type FileCategory = Database['public']['Enums']['file_category']
export type FileBucket = 'documents' | 'avatars'

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
      const { file, bucket, category } = input

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Oturum bulunamadı.')

      const checksum = await sha256(file)
      const path = `${category}/${crypto.randomUUID()}.${extensionOf(file.name)}`

      const upload = await supabase.storage.from(bucket).upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })
      if (upload.error) throw upload.error

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
          bucket,
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
        // files kaydı oluşmadıysa yarım nesneyi temizle (RLS izin verir: kayıt yok)
        await supabase.storage.from(bucket).remove([path])
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

/** Görsel dönüşümü (thumbnail) — Supabase image transform. Plan desteklemezse çağıran onError ile düşer. */
export interface ImgTransform { width?: number; height?: number; resize?: 'cover' | 'contain' | 'fill' }

/** İmzalı indirme/önizleme URL'i üretir (özel bucket'lar için tek erişim yolu). */
export async function getSignedUrl(
  bucket: FileBucket,
  path: string,
  expiresInSeconds = 60,
  /** Verilirse indirilebilir URL (Content-Disposition: attachment; filename). */
  downloadName?: string,
  transform?: ImgTransform,
): Promise<string> {
  const opts: { download?: string; transform?: ImgTransform } = {}
  if (downloadName) opts.download = downloadName
  if (transform) opts.transform = transform
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds, Object.keys(opts).length ? opts : undefined)
  if (error) throw error
  return data.signedUrl
}

/** İmzalı URL'i React Query ile (önizleme bileşenleri için). transform verilirse thumbnail. */
export function useSignedUrl(file: Pick<FileRow, 'bucket' | 'storage_path'> | null, transform?: ImgTransform) {
  return useQuery({
    queryKey: ['signed-url', file?.bucket, file?.storage_path, transform?.width, transform?.height, transform?.resize],
    enabled: !!file,
    staleTime: 45_000, // 60sn imzadan biraz kısa
    queryFn: () => getSignedUrl(file!.bucket as FileBucket, file!.storage_path, 60, undefined, transform),
  })
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
