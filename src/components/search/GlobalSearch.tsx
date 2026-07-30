import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Sparkles, Building2, Loader2 } from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useGlobalSearch, type SearchHit } from '@/hooks/useSearch'

/** Üst çubuktaki global arama: buton + Cmd/Ctrl+K. Sunucu tarafı RPC (shouldFilter kapalı). */
export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const navigate = useNavigate()

  // Cmd/Ctrl+K ile aç
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // debounce
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250)
    return () => clearTimeout(t)
  }, [query])

  const { data: hits, isFetching } = useGlobalSearch(debounced)
  const leads = (hits ?? []).filter((h) => h.entity_type === 'lead')
  const customers = (hits ?? []).filter((h) => h.entity_type === 'customer')

  function go(h: SearchHit) {
    setOpen(false)
    setQuery('')
    navigate(h.entity_type === 'lead' ? `/potansiyeller/${h.id}` : `/musteriler/${h.id}`)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-text-muted hover:bg-muted border-border flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
      >
        <Search className="size-4" />
        <span className="hidden sm:inline">Ara…</span>
        <kbd className="text-text-muted bg-muted ml-2 hidden rounded px-1.5 text-[10px] sm:inline">⌘K</kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0" showCloseButton={false}>
          <DialogTitle className="sr-only">Global arama</DialogTitle>
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Firma, kişi, telefon, e-posta, vergi no veya kod ara…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
          {debounced.trim().length < 2 ? (
            <CommandEmpty>En az 2 karakter yazın.</CommandEmpty>
          ) : isFetching ? (
            <div className="text-text-muted flex items-center gap-2 p-4 text-sm">
              <Loader2 className="size-4 animate-spin" /> Aranıyor…
            </div>
          ) : (hits ?? []).length === 0 ? (
            <CommandEmpty>Sonuç bulunamadı.</CommandEmpty>
          ) : (
            <>
              {customers.length > 0 && (
                <CommandGroup heading="Müşteriler">
                  {customers.map((h) => (
                    <CommandItem key={`c-${h.id}`} value={`c-${h.id}`} onSelect={() => go(h)}>
                      <Building2 className="size-4" />
                      <HitRow hit={h} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {leads.length > 0 && (
                <CommandGroup heading="Potansiyeller">
                  {leads.map((h) => (
                    <CommandItem key={`l-${h.id}`} value={`l-${h.id}`} onSelect={() => go(h)}>
                      <Sparkles className="size-4" />
                      <HitRow hit={h} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              </>
            )}
          </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  )
}

function HitRow({ hit }: { hit: SearchHit }) {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="truncate text-sm text-foreground">
          {hit.code && <span className="text-text-muted mr-1.5 font-mono text-xs">{hit.code}</span>}
          {hit.title ?? '—'}
        </div>
        {hit.subtitle && <div className="text-text-muted truncate text-xs">{hit.subtitle}</div>}
      </div>
      <span className="text-text-muted shrink-0 text-[10px]">{hit.reason}</span>
    </div>
  )
}
