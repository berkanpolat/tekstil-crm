import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Upload, FileSpreadsheet } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { useDocCategoryOptions } from '@/hooks/useDocuments'
import { useCatalogs, useSaveCatalogProduct } from '@/hooks/useCatalog'

/** Basit CSV ayrıştırıcı (tırnaklı alanları destekler). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = '' }
    else cur += c
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  return rows.filter((r) => r.some((x) => x.trim()))
}
const norm = (s: string) => s.toLocaleLowerCase('tr').replace(/[^a-z0-9]/g, '')
// başlık → alan eşlemesi (esnek)
const FIELD_ALIASES: Record<string, string[]> = {
  code: ['kod', 'urunkodu', 'code'], name: ['ad', 'urunadi', 'name', 'urun'], collection: ['koleksiyon', 'collection'],
  grup: ['kategori', 'grup', 'category'], tur: ['tur', 'uruntipi', 'tip', 'type'], composition: ['kompozisyon', 'composition'], moq: ['moq', 'minsiparis', 'minimum'],
}

/** P4B.2 — Arayüzden katalog içe aktarma (CSV). PDF için scripts/import-catalog.mjs. */
export function CatalogImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const catalogs = useCatalogs()
  const cats = useDocCategoryOptions()
  const save = useSaveCatalogProduct()
  const [catalogId, setCatalogId] = useState<string | null>(null)
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ ins: number; err: number } | null>(null)

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const grid = parseCsv(String(reader.result || ''))
      if (grid.length < 2) { toast.error('CSV boş ya da yalnız başlık.'); return }
      const header = grid[0]!.map(norm)
      const colOf = (field: string) => header.findIndex((h) => FIELD_ALIASES[field]!.some((a) => h === a || h.includes(a)))
      const idx = Object.fromEntries(Object.keys(FIELD_ALIASES).map((f) => [f, colOf(f)]))
      if ((idx.code ?? -1) < 0 || (idx.name ?? -1) < 0) { toast.error('CSV başlığında "kod" ve "ad" sütunları gerekli.'); return }
      setRows(grid.slice(1).map((r) => Object.fromEntries(Object.entries(idx).map(([f, i]) => [f, (i >= 0 ? r[i] : '')?.trim() ?? '']))))
    }
    reader.readAsText(file, 'utf-8')
  }

  async function doImport() {
    if (!catalogId) { toast.error('Katalog seçin.'); return }
    setBusy(true); let ins = 0, err = 0
    const groups = cats.data?.groups ?? []
    for (const r of rows) {
      if (!r.code || !r.name) { err++; continue }
      const gid = groups.find((g) => norm(g.label) === norm(r.grup || '') || norm(g.label).endsWith(norm(r.grup || '')))?.id ?? null
      const tid = gid != null ? (cats.data?.typesByGroup[gid] ?? []).find((t) => norm(t.label) === norm(r.tur || ''))?.id ?? null : null
      try {
        await save.mutateAsync({ code: r.code, name: r.name, catalog_id: Number(catalogId), category_id: gid, type_id: tid,
          composition: r.composition || null, moq: Number(r.moq) || 50, size_system: 'Alfa', sizes: ['XS', 'S', 'M', 'L', 'XL'] } as never)
        ins++
      } catch { err++ }
    }
    setBusy(false); setDone({ ins, err })
    toast.success(`${ins} ürün aktarıldı${err ? `, ${err} hata` : ''}.`)
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Katalog içe aktar (CSV)</DialogTitle>
          <DialogDescription>Sütunlar: kod, ad, koleksiyon, kategori, tür, kompozisyon, moq. PDF için içe-aktarma script'i kullanılır.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-sm">Hedef katalog</Label><SearchableSelect className="mt-1" options={(catalogs.data ?? []).map((c) => ({ value: String(c.id), label: c.name }))} value={catalogId} onChange={setCatalogId} placeholder="Katalog seç" /></div>
          <div>
            <input id="csvfile" type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
            <Button variant="outline" onClick={() => document.getElementById('csvfile')?.click()}><FileSpreadsheet className="size-4" /> CSV seç</Button>
            {rows.length > 0 && <span className="ml-2 text-sm text-text-muted">{rows.length} satır okundu</span>}
          </div>
          {rows.length > 0 && !done && (
            <div className="max-h-64 overflow-auto rounded-md border border-border">
              <table className="w-full text-xs"><thead className="bg-muted/50 text-text-muted"><tr>{['Kod', 'Ad', 'Koleksiyon', 'Kategori', 'Tür', 'MOQ'].map((h) => <th key={h} className="px-2 py-1 text-left">{h}</th>)}</tr></thead>
                <tbody>{rows.slice(0, 30).map((r, i) => <tr key={i} className="border-t border-border"><td className="px-2 py-1 font-mono">{r.code}</td><td className="px-2 py-1">{r.name}</td><td className="px-2 py-1">{r.collection}</td><td className="px-2 py-1">{r.grup}</td><td className="px-2 py-1">{r.tur}</td><td className="px-2 py-1">{r.moq || 50}</td></tr>)}</tbody>
              </table>
              {rows.length > 30 && <p className="p-2 text-center text-xs text-text-muted">… {rows.length - 30} satır daha</p>}
            </div>
          )}
          {done && <p className="text-sm text-success-foreground">✓ {done.ins} ürün aktarıldı{done.err ? `, ${done.err} atlandı (kod/ad eksik)` : ''}.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={done ? onDone : onClose}>{done ? 'Kapat' : 'Vazgeç'}</Button>
          {!done && <Button onClick={() => void doImport()} disabled={busy || !rows.length || !catalogId}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} {rows.length} ürünü aktar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
