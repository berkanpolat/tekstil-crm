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
  /**
   * Listede olmayan serbest metni de değer olarak kabul et (ör. ülke/ilçe:
   * mevcut kayıtlarda listede bulunmayan değerler korunur). Kapalıyken (varsayılan)
   * yalnız options içinden seçim yapılır — sistemdeki diğer tüm menüler böyle.
   */
  allowCustom?: boolean
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
  allowCustom = false,
  disabled,
  id,
  className,
  'aria-invalid': ariaInvalid,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const selected = options.find((o) => o.value === value)
  // Serbest metin modunda listede olmayan değer, etiketi kendisi olur (kaybolmaz).
  const displayLabel = selected?.label ?? (allowCustom && value ? value : null)
  const trimmed = search.trim()
  const showCustom =
    allowCustom &&
    trimmed.length > 0 &&
    !options.some((o) => o.label.toLocaleLowerCase('tr') === trimmed.toLocaleLowerCase('tr'))

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setSearch('')
      }}
    >
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
            !displayLabel && 'text-muted-foreground',
            ariaInvalid && 'border-destructive',
            className,
          )}
        >
          <span className="truncate">{displayLabel ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(val, search) => {
            // Serbest metin ("… olarak kullan") öğesi her zaman görünür kalsın.
            if (val.startsWith('__custom__')) return 1
            const opt = options.find((o) => o.value === val)
            const hay = `${opt?.label ?? ''} ${opt?.keywords ?? ''}`.toLocaleLowerCase('tr')
            return hay.includes(search.toLocaleLowerCase('tr')) ? 1 : 0
          }}
        >
          <CommandInput
            placeholder={searchPlaceholder}
            value={allowCustom ? search : undefined}
            onValueChange={allowCustom ? setSearch : undefined}
          />
          {/* Dialog içindeyken Radix scroll-lock (react-remove-scroll) portala giden liste üzerinde
              tekerlek/dokunuşu engelliyordu → kaydırılamıyordu. Olayı listede durdurunca native scroll çalışır. */}
          <CommandList onWheel={(e) => e.stopPropagation()} onTouchMove={(e) => e.stopPropagation()}>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {showCustom && (
                <CommandItem
                  value={`__custom__${trimmed}`}
                  onSelect={() => {
                    onChange(trimmed)
                    setSearch('')
                    setOpen(false)
                  }}
                >
                  <Check className="size-4 opacity-0" />
                  <span className="truncate">“{trimmed}” olarak kullan</span>
                </CommandItem>
              )}
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
                  onSelect={() => {
                    // cmdk onSelect değeri küçük harfe çevirir; closure opt.value kullan (metin
                    // değerli seçimler bozulmasın — ör. "Kadın Giyim" grubu). QA#4b.
                    onChange(opt.value === value ? (clearable ? null : opt.value) : opt.value)
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
