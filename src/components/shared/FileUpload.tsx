import { useRef, useState } from 'react'
import { Upload, FileText, ImageIcon, Trash2, Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  useUploadFile,
  useEntityFiles,
  useDeleteFile,
  getSignedUrl,
  isPreviewable,
  type FileBucket,
  type FileCategory,
  type FileRow,
} from '@/hooks/useFiles'
import { cn } from '@/lib/utils'

/*
 * Faz 0 / P0.7 — yeniden kullanılabilir dosya yükleme + liste bileşeni.
 * Mantık tamamen src/hooks/useFiles.ts'te. Görsel cila (drag-drop animasyonu,
 * sürüm geçmişi paneli, ilerleme çubuğu) P0.10 tasarım sisteminde tamamlanacak.
 */

interface FileUploadProps {
  bucket: FileBucket
  category: FileCategory
  entityType: string
  entityId: string
  className?: string
}

function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FileUpload({ bucket, category, entityType, entityId, className }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const upload = useUploadFile()
  const files = useEntityFiles(entityType, entityId)

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    for (const file of Array.from(list)) {
      try {
        await upload.mutateAsync({ file, bucket, category, entityType, entityId })
        toast.success(`${file.name} yüklendi`)
      } catch (err) {
        toast.error(`${file.name} yüklenemedi: ${(err as Error).message}`)
      }
    }
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          void handleFiles(e.dataTransfer.files)
        }}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center transition-colors',
          dragOver ? 'border-primary bg-primary/5' : 'border-input bg-muted/40',
        )}
      >
        {upload.isPending ? (
          <Loader2 className="text-muted-foreground size-6 animate-spin" />
        ) : (
          <Upload className="text-muted-foreground size-6" />
        )}
        <p className="text-sm text-muted-foreground">
          Dosyayı buraya sürükleyin ya da seçin
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={upload.isPending}
          onClick={() => inputRef.current?.click()}
        >
          Dosya seç
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>

      <FileList files={files.data ?? []} loading={files.isLoading} />
    </div>
  )
}

export function FileList({ files, loading }: { files: FileRow[]; loading?: boolean }) {
  const del = useDeleteFile()

  async function openSigned(file: FileRow) {
    try {
      const url = await getSignedUrl(file.bucket as FileBucket, file.storage_path)
      window.open(url, '_blank', 'noopener')
    } catch (err) {
      toast.error(`Bağlantı oluşturulamadı: ${(err as Error).message}`)
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Yükleniyor…</p>
  }
  if (files.length === 0) {
    return <p className="text-sm text-muted-foreground">Henüz dosya yok.</p>
  }

  return (
    <ul className="divide-border divide-y rounded-lg border">
      {files.map((file) => (
        <li key={file.id} className="flex items-center gap-3 p-3">
          {isPreviewable(file.mime_type) && file.mime_type?.startsWith('image/') ? (
            <ImageIcon className="text-muted-foreground size-5 shrink-0" />
          ) : (
            <FileText className="text-muted-foreground size-5 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{file.original_name}</p>
            <p className="text-xs text-muted-foreground">
              {formatSize(file.size_bytes)}
              {file.version > 1 ? ` · sürüm ${file.version}` : ''}
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => void openSigned(file)}>
            <Download className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={del.isPending}
            onClick={() => del.mutate(file)}
          >
            <Trash2 className="text-destructive size-4" />
          </Button>
        </li>
      ))}
    </ul>
  )
}
