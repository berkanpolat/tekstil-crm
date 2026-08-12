import { useState } from 'react'
import { Download, Loader2, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { toUserMessage } from '@/lib/errors'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { FilesPanel } from '@/components/files/FilesPanel'
import { useDocumentsList, type DocumentListRow } from '@/hooks/useDocumentsList'
import { getSignedUrl } from '@/hooks/useFiles'

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Madde 12 — Müşteri Dosyalar sekmesi: üretilen belgeler (teklif/sipariş/maliyet …) + yüklenen dosyalar. */
export function CustomerFilesTab({ customerId }: { customerId: number }) {
  const { data, isLoading } = useDocumentsList({ customerId, page: 1, pageSize: 100 })
  const [downloading, setDownloading] = useState<number | null>(null)

  async function download(d: DocumentListRow) {
    if (!d.storage_path) return
    setDownloading(d.id)
    try {
      const name = d.file_name ?? `${d.type_label}.pdf`
      const url = await getSignedUrl('documents', d.storage_path, 60, name)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (err) {
      toast.error(await toUserMessage(err))
    } finally {
      setDownloading(null)
    }
  }

  const docs = data?.rows ?? []

  return (
    <div className="max-w-3xl space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">Üretilen belgeler</h3>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : docs.length === 0 ? (
          <EmptyState icon={FileText} title="Belge yok" description="Bu müşteri için henüz belge üretilmedi." />
        ) : (
          <ul className="space-y-2">
            {docs.map((d) => (
              <li key={d.id} className="border-border flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {d.type_label} · {fmtDate(d.generated_at ?? d.created_at)}
                  </p>
                  <p className="text-text-muted truncate text-xs">
                    {d.operation_code}
                    {d.language ? ` · ${d.language.toUpperCase()}` : ''}
                    {d.file_name ? ` · ${d.file_name}` : ''}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={!d.storage_path || downloading === d.id}
                  title={d.storage_path ? 'İndir' : 'Dosya henüz üretilmedi'}
                  onClick={() => void download(d)}
                >
                  {downloading === d.id ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">Yüklenen dosyalar</h3>
        <FilesPanel entityType="customer" entityId={customerId} />
      </section>
    </div>
  )
}
