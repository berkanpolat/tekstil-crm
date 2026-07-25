import { useState, type ReactNode } from 'react'
import { ArrowUp, ArrowDown, ChevronsUpDown, SlidersHorizontal, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from './EmptyState'

export interface DataTableColumn<T> {
  key: string
  header: string
  cell: (row: T) => ReactNode
  sortable?: boolean
  hideable?: boolean
  align?: 'left' | 'right' | 'center'
  className?: string
}

export interface SortState {
  key: string
  dir: 'asc' | 'desc'
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  data: T[]
  rowKey: (row: T) => string
  loading?: boolean

  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  pageSizeOptions?: number[]

  sort?: SortState | null
  onSortChange?: (sort: SortState) => void

  selectable?: boolean
  selectedKeys?: Set<string>
  onSelectedChange?: (keys: Set<string>) => void

  onRowClick?: (row: T) => void
  emptyState?: ReactNode
  /** Kolon görünürlüğü menüsünü göster. */
  columnToggle?: boolean
}

const ALIGN: Record<string, string> = { left: 'text-left', right: 'text-right', center: 'text-center' }

/**
 * Sunucu tarafı DataTable: sayfalama, sıralama, kolon gizleme, satır seçimi,
 * yükleniyor iskeleti, boş durum. Yalnızca geçerli sayfa render edildiği için
 * 100.000 satırda da hızlı (veri sunucudan sayfalı gelir).
 */
export function DataTable<T>({
  columns,
  data,
  rowKey,
  loading,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100],
  sort,
  onSortChange,
  selectable,
  selectedKeys,
  onSelectedChange,
  onRowClick,
  emptyState,
  columnToggle = true,
}: DataTableProps<T>) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const visibleColumns = columns.filter((c) => !hidden.has(c.key))
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const pageKeys = data.map(rowKey)
  const selected = selectedKeys ?? new Set<string>()
  const allChecked = pageKeys.length > 0 && pageKeys.every((k) => selected.has(k))
  const someChecked = pageKeys.some((k) => selected.has(k))

  function toggleAll() {
    const next = new Set(selected)
    if (allChecked) pageKeys.forEach((k) => next.delete(k))
    else pageKeys.forEach((k) => next.add(k))
    onSelectedChange?.(next)
  }
  function toggleRow(key: string) {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onSelectedChange?.(next)
  }
  function clickSort(col: DataTableColumn<T>) {
    if (!col.sortable || !onSortChange) return
    const dir: SortState['dir'] = sort?.key === col.key && sort.dir === 'asc' ? 'desc' : 'asc'
    onSortChange({ key: col.key, dir })
  }

  const colSpan = visibleColumns.length + (selectable ? 1 : 0)

  return (
    <div className="bg-card overflow-hidden rounded-lg border shadow-card">
      {(columnToggle || (selectable && selected.size > 0)) && (
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <div className="text-text-secondary text-sm">
            {selectable && selected.size > 0 ? `${selected.size} satır seçili` : ''}
          </div>
          {columnToggle && columns.some((c) => c.hideable) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  <SlidersHorizontal className="size-4" /> Kolonlar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Görünür kolonlar</DropdownMenuLabel>
                {columns
                  .filter((c) => c.hideable)
                  .map((c) => (
                    <DropdownMenuCheckboxItem
                      key={c.key}
                      checked={!hidden.has(c.key)}
                      onCheckedChange={(checked) => {
                        const next = new Set(hidden)
                        if (checked) next.delete(c.key)
                        else next.add(c.key)
                        setHidden(next)
                      }}
                    >
                      {c.header}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-subtle hover:bg-subtle">
              {selectable && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={allChecked ? true : someChecked ? 'indeterminate' : false}
                    onCheckedChange={toggleAll}
                    aria-label="Tümünü seç"
                  />
                </TableHead>
              )}
              {visibleColumns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(
                    'text-text-secondary text-xs font-medium',
                    ALIGN[col.align ?? 'left'],
                    col.sortable && 'cursor-pointer select-none',
                    col.className,
                  )}
                  onClick={() => clickSort(col)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable &&
                      (sort?.key === col.key ? (
                        sort.dir === 'asc' ? (
                          <ArrowUp className="size-3.5" />
                        ) : (
                          <ArrowDown className="size-3.5" />
                        )
                      ) : (
                        <ChevronsUpDown className="size-3.5 opacity-40" />
                      ))}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: Math.min(pageSize, 8) }).map((_, i) => (
                <TableRow key={`sk-${i}`}>
                  {selectable && (
                    <TableCell>
                      <Skeleton className="size-4" />
                    </TableCell>
                  )}
                  {visibleColumns.map((col) => (
                    <TableCell key={col.key}>
                      <Skeleton className="h-4 w-full max-w-[160px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : data.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={colSpan} className="p-0">
                  {emptyState ?? <EmptyState title="Kayıt bulunamadı" description="Filtreleri değiştirmeyi deneyin." />}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => {
                const key = rowKey(row)
                return (
                  <TableRow
                    key={key}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn('h-16', onRowClick && 'cursor-pointer')}
                    data-state={selected.has(key) ? 'selected' : undefined}
                  >
                    {selectable && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(key)}
                          onCheckedChange={() => toggleRow(key)}
                          aria-label="Satırı seç"
                        />
                      </TableCell>
                    )}
                    {visibleColumns.map((col) => (
                      <TableCell key={col.key} className={cn(ALIGN[col.align ?? 'left'], col.className)}>
                        {col.cell(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Sayfalama */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2">
        <div className="text-text-secondary text-sm">
          {total > 0 ? `Toplam ${total.toLocaleString('tr')} kayıt` : 'Kayıt yok'}
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
    </div>
  )
}
