import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export interface SelectOption {
  value: string
  label: string
  /** Aramada etikete ek anahtar kelimeler (ör. kod). */
  keywords?: string
}

interface SearchableSelectProps {
  options: SelectOption[]
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  /** Seçimi temizlemeye izin ver. */
  clearable?: boolean
  disabled?: boolean
  id?: string
  className?: string
  'aria-invalid'?: boolean
}

/**
 * Aranabilir tekil seçim. Sistemdeki HER açılır menü bunu kullanır (CEO'nun açık
 * talebi — istisna yok). Popover + cmdk ile klavye erişilebilir.
 */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Seçin',
  searchPlaceholder = 'Ara…',
  emptyText = 'Sonuç yok',
  clearable = false,
  disabled,
  id,
  className,
  'aria-invalid': ariaInvalid,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={ariaInvalid}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !selected && 'text-muted-foreground',
            ariaInvalid && 'border-destructive',
            className,
          )}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(val, search) => {
            const opt = options.find((o) => o.value === val)
            const hay = `${opt?.label ?? ''} ${opt?.keywords ?? ''}`.toLocaleLowerCase('tr')
            return hay.includes(search.toLocaleLowerCase('tr')) ? 1 : 0
          }}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {clearable && value != null && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange(null)
                    setOpen(false)
                  }}
                  className="text-text-secondary"
                >
                  Seçimi temizle
                </CommandItem>
              )}
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.value}
                  onSelect={(v) => {
                    onChange(v === value ? (clearable ? null : v) : v)
                    setOpen(false)
                  }}
                >
                  <Check className={cn('size-4', value === opt.value ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{opt.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
