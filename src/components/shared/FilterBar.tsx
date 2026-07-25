import type { ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface FilterBarProps {
  search?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  /** Aktif filtre varsa "Filtreleri temizle" göster. */
  showClear?: boolean
  onClear?: () => void
  /** Ek filtreler (SearchableSelect, DateRangePicker, çipler). */
  children?: ReactNode
  className?: string
}

/** Filtre çubuğu: arama kutusu, filtre alanları, "filtreleri temizle". */
export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = 'Ara…',
  showClear,
  onClear,
  children,
  className,
}: FilterBarProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {onSearchChange && (
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="text-text-muted pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={search ?? ''}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-8"
          />
        </div>
      )}
      {children}
      {showClear && (
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          <X className="size-4" /> Filtreleri temizle
        </Button>
      )}
    </div>
  )
}
