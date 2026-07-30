import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { format, parse, isValid } from 'date-fns'
import { tr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface DatePickerProps {
  /** ISO tarih (yyyy-MM-dd) veya null. */
  value: string | null
  onChange: (iso: string | null) => void
  placeholder?: string
  id?: string
  clearable?: boolean
  className?: string
  disabled?: boolean
}

/**
 * Tekil tarih seçici — TR biçiminde gösterir (GG.AA.YYYY), yerel tarayıcı date
 * input'unun mm/dd/yyyy sorununu ortadan kaldırır. Değer ISO (yyyy-MM-dd) tutulur.
 */
export function DatePicker({ value, onChange, placeholder = 'Tarih seç', id, clearable, className, disabled }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const selected = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined
  const valid = selected && isValid(selected) ? selected : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" disabled={disabled}
          className={cn('w-full justify-start font-normal', !valid && 'text-muted-foreground', className)}>
          <CalendarDays className="mr-2 size-4 shrink-0 opacity-60" />
          {valid ? format(valid, 'dd.MM.yyyy', { locale: tr }) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" locale={tr} selected={valid} defaultMonth={valid}
          onSelect={(d) => { onChange(d ? format(d, 'yyyy-MM-dd') : null); setOpen(false) }} />
        {clearable && valid && (
          <div className="border-t p-2">
            <Button type="button" variant="ghost" size="sm" className="w-full"
              onClick={() => { onChange(null); setOpen(false) }}>Temizle</Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
