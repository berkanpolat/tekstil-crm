import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
} from 'date-fns'
import { tr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export interface DateRange {
  from?: Date
  to?: Date
}

interface DateRangePickerProps {
  value: DateRange | undefined
  onChange: (range: DateRange | undefined) => void
  className?: string
}

type Preset = { key: string; label: string; range: () => DateRange }

const PRESETS: Preset[] = [
  { key: 'today', label: 'Bugün', range: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }) },
  {
    key: 'week',
    label: 'Bu hafta',
    range: () => ({
      from: startOfWeek(new Date(), { weekStartsOn: 1 }),
      to: endOfWeek(new Date(), { weekStartsOn: 1 }),
    }),
  },
  { key: 'month', label: 'Bu ay', range: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
]

function labelFor(range: DateRange | undefined): string {
  if (!range?.from) return 'Tarih aralığı'
  const f = format(range.from, 'd MMM yyyy', { locale: tr })
  if (!range.to) return f
  return `${f} – ${format(range.to, 'd MMM yyyy', { locale: tr })}`
}

/** Tarih aralığı seçici — hazır aralıklar (bugün/bu hafta/bu ay) + özel takvim. */
export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn('justify-start font-normal', !value?.from && 'text-muted-foreground', className)}
        >
          <CalendarDays className="size-4" />
          <span className="truncate">{labelFor(value)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col gap-1 border-b p-2 sm:flex-row">
          {PRESETS.map((p) => (
            <Button
              key={p.key}
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start"
              onClick={() => {
                onChange(p.range())
                setOpen(false)
              }}
            >
              {p.label}
            </Button>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-start"
            onClick={() => onChange(undefined)}
          >
            Temizle
          </Button>
        </div>
        <Calendar
          mode="range"
          numberOfMonths={2}
          locale={tr}
          selected={value as never}
          onSelect={(r) => onChange(r as DateRange | undefined)}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}
