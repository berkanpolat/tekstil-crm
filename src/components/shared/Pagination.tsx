import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  pageSizeOptions?: number[]
  loading?: boolean
  /** Konum metnindeki birim (ör. "kayıt", "ürün"). */
  unitLabel?: string
  className?: string
}

/**
 * Sunucu tarafı sayfalama çubuğu: konum bilgisi ("1–24 / 197"), sayfa boyutu
 * seçici ve ileri/geri düğmeleri. DataTable ve ızgara görünümleri ortak kullanır.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100],
  loading,
  unitLabel = 'kayıt',
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <div className="text-text-secondary text-sm">
        {total > 0
          ? `${((page - 1) * pageSize + 1).toLocaleString('tr')}–${Math.min(page * pageSize, total).toLocaleString('tr')} / ${total.toLocaleString('tr')} ${unitLabel}`
          : `${unitLabel === 'kayıt' ? 'Kayıt' : unitLabel} yok`}
      </div>
      <div className="flex items-center gap-3">
        {onPageSizeChange && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="border-input bg-card h-8 rounded-md border px-2 text-sm"
            aria-label="Sayfa boyutu"
          >
            {pageSizeOptions.map((s) => (
              <option key={s} value={s}>
                {s} / sayfa
              </option>
            ))}
          </select>
        )}
        <span className="text-text-secondary text-sm">
          Sayfa {page} / {totalPages}
        </span>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            disabled={page <= 1 || loading}
            onClick={() => onPageChange(page - 1)}
            aria-label="Önceki sayfa"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            disabled={page >= totalPages || loading}
            onClick={() => onPageChange(page + 1)}
            aria-label="Sonraki sayfa"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
