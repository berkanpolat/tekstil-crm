import { useRef, useState } from 'react'
import { Upload, Download, Trash2, Loader2, Paperclip } from 'lucide-react'
import { toast } from 'sonner'
import { toUserMessage } from '@/lib/errors'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useEntityFiles,
  useUploadFile,
  useDeleteFile,
  getSignedUrl,
  type FileRow,
  type FileBucket,
} from '@/hooks/useFiles'

const BUCKET: FileBucket = 'documents'

function fmtSize(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function FilesPanel({ entityType, entityId }: { entityType: 'lead' | 'customer' | 'operation' | 'task'; entityId: number }) {
  const eid = String(entityId)
  const { data: files, isLoading } = useEntityFiles(entityType, eid)
  const upload = useUploadFile()
  const del = useDeleteFile()
  const inputRef = useRef<HTMLInputElement>(null)
  const [downloading, setDownloading] = useState<number | null>(null)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (inputRef.current) inputRef.current.value = ''
    if (!file) return
    try {
      await upload.mutateAsync({
        file,
        bucket: BUCKET,
        category: file.type.startsWith('image/') ? 'image' : 'document',
        entityType,
        entityId: eid,
      })
      toast.success('Dosya yüklendi.')
    } catch (err) {
      toast.error(await toUserMessage(err))
    }
  }

  async function download(f: FileRow) {
    setDownloading(f.id)
    try {
      // İmzalı URL Content-Disposition: attachment ile → yeni pencere değil, doğrudan indir.
      const url = await getSignedUrl(f.bucket as FileBucket, f.storage_path, 60, f.original_name)
      const a = document.createElement('a')
      a.href = url
      a.download = f.original_name
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (err) {
      toast.error(await toUserMessage(err))
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex justify-end">
        <input ref={inputRef} type="file" className="hidden" onChange={onPick} />
        <Button size="sm" onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
          {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Dosya yükle
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (files ?? []).length === 0 ? (
        <EmptyState icon={Paperclip} title="Dosya yok" description="Sözleşme, teklif, görsel ekleyin." />
      ) : (
        <ul className="space-y-2">
          {(files ?? []).map((f) => (
            <li key={f.id} className="border-border flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{f.original_name}</p>
                <p className="text-text-muted text-xs">
                  {fmtSize(f.size_bytes)} · {fmt(f.created_at)}
                  {f.version != null && f.version > 1 && ` · s${f.version}`}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button type="button" variant="ghost" size="icon" disabled={downloading === f.id} onClick={() => void download(f)}>
                  {downloading === f.id ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={del.isPending}
                  onClick={async () => {
                    try {
                      await del.mutateAsync(f)
                    } catch (err) {
                      toast.error(await toUserMessage(err))
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
