import { useMemo, useRef, useState } from 'react'
import { Upload, Loader2, CheckCircle2, AlertTriangle, Undo2, History, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { toUserMessage } from '@/lib/errors'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { Button } from '@/components/ui/button'
import { parseCsv } from '@/lib/csv'
import { supabase } from '@/lib/supabase'
import {
  importFields,
  autoMap,
  useRunImport,
  useUndoImport,
  useImportBatches,
  fetchRememberedMapping,
  type ImportEntity,
  type ImportResult,
} from '@/hooks/useImport'
import { useLeadSourceOptions } from '@/hooks/useLeads'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  entity: ImportEntity
}

export function ImportDialog({ open, onOpenChange, entity }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        {open && <ImportFlow key={entity} entity={entity} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function ImportFlow({ entity, onClose }: { entity: ImportEntity; onClose: () => void }) {
  const fields = useMemo(() => importFields(entity), [entity])
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<string, number | null>>({})
  const [dup, setDup] = useState<{ count: number; total: number } | null>(null)
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [rememberedApplied, setRememberedApplied] = useState(false)
  const [sourceId, setSourceId] = useState<string | null>(null)   // 1.5 — partiye uygulanacak kaynak (lead için zorunlu)
  const sources = useLeadSourceOptions()

  const run = useRunImport()

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (inputRef.current) inputRef.current.value = ''
    if (!file) return
    try {
      const parsed = parseCsv(await file.text())
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        toast.error('CSV boş veya okunamadı.')
        return
      }
      const map = autoMap(parsed.headers, fields)
      // Önceki eşlemeyi (aynı dosya/başlık) öntanımlı uygula — tek seferde.
      const rem = await fetchRememberedMapping(entity, file.name, parsed.headers)
      if (rem) {
        for (const [key, headerName] of Object.entries(rem)) {
          const idx = parsed.headers.indexOf(headerName)
          if (idx >= 0) map[key] = idx
        }
      }
      setFileName(file.name)
      setHeaders(parsed.headers)
      setRows(parsed.rows)
      setMapping(map)
      setRememberedApplied(!!rem)
      setDup(null)
    } catch (err) {
      toast.error(await toUserMessage(err))
    }
  }

  const val = (r: string[], key: string) => {
    const idx = mapping[key]
    return idx == null ? null : (r[idx] ?? '').trim() || null
  }

  async function checkDuplicates() {
    setChecking(true)
    try {
      const rowsJson = rows.map((r) => ({ company: val(r, 'company_name'), phone: val(r, 'phone'), tax: val(r, 'tax_number') }))
      const { data, error } = await supabase.rpc('check_import_duplicates', { p_rows: rowsJson as never })
      if (error) throw error
      const count = (data as { matched: boolean }[]).filter((d) => d.matched).length
      setDup({ count, total: rows.length })
    } catch (err) {
      toast.error(await toUserMessage(err))
    } finally {
      setChecking(false)
    }
  }

  async function doImport() {
    try {
      const res = await run.mutateAsync({ entity, fileName, headers, rows, mapping, sourceId: sourceId ? Number(sourceId) : null })
      setResult(res)
      const msg = `${res.inserted} eklendi` + (res.skipped.length ? `, ${res.skipped.length} atlandı (mükerrer)` : '') + (res.errors.length ? `, ${res.errors.length} hata` : '')
      if (res.errors.length) toast.warning(msg)
      else toast.success(msg)
    } catch (err) {
      toast.error(await toUserMessage(err))
    }
  }

  const title = entity === 'lead' ? 'Potansiyel içe aktar' : 'Müşteri içe aktar'

  if (showHistory) return <ImportHistory entity={entity} onBack={() => setShowHistory(false)} onClose={onClose} />
  if (result) return <ResultView result={result} onClose={onClose} />

  const previewRows = rows.slice(0, 5)
  const headerOpts = headers.map((h, i) => ({ value: String(i), label: h || `(sütun ${i + 1})` }))

  return (
    <>
      <DialogHeader>
        <div className="flex items-center justify-between gap-2">
          <DialogTitle>{title}</DialogTitle>
          <Button variant="ghost" size="sm" onClick={() => setShowHistory(true)}>
            <History className="size-4" /> Geçmiş
          </Button>
        </div>
        <DialogDescription>
          CSV (`,` veya `;`). İlk satır başlık. Telefon/e-posta iletişim noktası olur. Mevcut kayıtla
          eşleşen satırlar (aynı firma/telefon/vergi no) atlanır.
        </DialogDescription>
      </DialogHeader>

      {headers.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
          <Button onClick={() => inputRef.current?.click()}>
            <Upload className="size-4" /> CSV seç
          </Button>
          <p className="text-text-muted text-xs">Örnek başlıklar: firma, kişi, şehir, telefon, e-posta, vergi no</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-text-secondary text-sm">
            <span className="font-medium text-foreground">{fileName}</span> — {rows.length} satır, {headers.length} sütun
            {rememberedApplied && <span className="text-success-foreground ml-2">· önceki eşleme uygulandı</span>}
          </p>

          {/* 1.5 — Kaynak seçimi (CSV'de kaynak olmayabilir) → tüm partiye uygulanır. Lead için zorunlu. */}
          {entity === 'lead' && (
            <div className="flex items-center gap-2">
              <span className="text-text-secondary w-28 shrink-0 text-sm">Kaynak <span className="text-danger-foreground">*</span></span>
              <SearchableSelect className="flex-1 sm:max-w-xs" options={(sources.data ?? []).map((s) => ({ value: String(s.id), label: s.label }))}
                value={sourceId} onChange={setSourceId} placeholder="Web scraper, fuar, referans…" />
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.key} className="flex items-center gap-2">
                <span className="text-text-secondary w-28 shrink-0 text-sm">{f.label}</span>
                <SearchableSelect
                  options={headerOpts}
                  value={mapping[f.key] != null ? String(mapping[f.key]) : null}
                  onChange={(v) => setMapping((m) => ({ ...m, [f.key]: v != null ? Number(v) : null }))}
                  placeholder="— (yok)"
                  clearable
                  className="flex-1"
                />
              </div>
            ))}
          </div>

          <div className="border-border overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-text-muted text-xs">
                <tr>
                  {fields.filter((f) => mapping[f.key] != null).map((f) => (
                    <th key={f.key} className="px-3 py-2 text-left whitespace-nowrap">{f.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, i) => (
                  <tr key={i} className="border-border border-t">
                    {fields.filter((f) => mapping[f.key] != null).map((f) => (
                      <td key={f.key} className="px-3 py-1.5 whitespace-nowrap text-foreground">
                        {(r[mapping[f.key] as number] ?? '').trim() || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => void checkDuplicates()} disabled={checking}>
              {checking && <Loader2 className="size-4 animate-spin" />} Mükerrer kontrol et (tüm dosya)
            </Button>
            {dup && (
              <span className={dup.count > 0 ? 'text-warning-foreground text-sm' : 'text-text-muted text-sm'}>
                {dup.count > 0
                  ? `${dup.total} satırdan ${dup.count}'i mevcut kayıtla eşleşiyor → içe aktarmada atlanacak.`
                  : 'Mükerrer bulunmadı.'}
              </span>
            )}
          </div>
        </div>
      )}

      {headers.length > 0 && (
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={run.isPending}>Vazgeç</Button>
          <Button onClick={() => void doImport()} disabled={run.isPending || (entity === 'lead' && !sourceId)}
            title={entity === 'lead' && !sourceId ? 'Önce kaynak seçin' : undefined}>
            {run.isPending && <Loader2 className="size-4 animate-spin" />}
            {rows.length} satırı içe aktar
          </Button>
        </DialogFooter>
      )}
    </>
  )
}

function ResultView({ result, onClose }: { result: ImportResult; onClose: () => void }) {
  const undo = useUndoImport()
  return (
    <>
      <DialogHeader>
        <DialogTitle>İçe aktarma sonucu</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="size-5 text-success-foreground" />
            <span className="font-medium text-foreground">{result.inserted}</span> eklendi
          </span>
          {result.skipped.length > 0 && (
            <span className="text-warning-foreground">{result.skipped.length} atlandı (mükerrer)</span>
          )}
          {result.errors.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <AlertTriangle className="size-5 text-warning-foreground" />
              <span className="font-medium text-foreground">{result.errors.length}</span> hata
            </span>
          )}
        </div>
        {(result.errors.length > 0 || result.skipped.length > 0) && (
          <div className="border-border max-h-60 overflow-y-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-text-muted text-xs">
                <tr><th className="px-3 py-2 text-left">Satır</th><th className="px-3 py-2 text-left">Durum</th></tr>
              </thead>
              <tbody>
                {result.errors.map((e) => (
                  <tr key={`e${e.row}`} className="border-border border-t">
                    <td className="text-text-muted px-3 py-1.5">{e.row}</td>
                    <td className="px-3 py-1.5 text-danger-foreground">{e.message}</td>
                  </tr>
                ))}
                {result.skipped.map((s) => (
                  <tr key={`s${s.row}`} className="border-border border-t">
                    <td className="text-text-muted px-3 py-1.5">{s.row}</td>
                    <td className="text-text-secondary px-3 py-1.5">atlandı — {s.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {result.inserted > 0 && <p className="text-text-muted text-xs">Parti #{result.batchId}. Hatalıysa geri alınabilir (çalışılmış kayıtlar korunur).</p>}
      </div>
      <DialogFooter>
        {result.inserted > 0 && (
          <Button variant="outline" disabled={undo.isPending} onClick={async () => {
            try {
              const r = await undo.mutateAsync(result.batchId)
              toast.success(`${r.undone} geri alındı${r.skipped ? `, ${r.skipped} korundu (çalışılmış)` : ''}.`)
              onClose()
            } catch (err) { toast.error(await toUserMessage(err)) }
          }}>
            {undo.isPending ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />} Partiyi geri al
          </Button>
        )}
        <Button onClick={onClose}>Kapat</Button>
      </DialogFooter>
    </>
  )
}

function ImportHistory({ entity, onBack, onClose }: { entity: ImportEntity; onBack: () => void; onClose: () => void }) {
  const { data: batches, isLoading } = useImportBatches()
  const undo = useUndoImport()
  const list = (batches ?? []).filter((b) => b.entity_type === entity)

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="size-4" /></Button>
          <DialogTitle>İçe aktarma geçmişi</DialogTitle>
        </div>
      </DialogHeader>
      {isLoading ? (
        <p className="text-text-muted p-4 text-sm">Yükleniyor…</p>
      ) : list.length === 0 ? (
        <p className="text-text-muted p-4 text-sm">Kayıt yok.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((b) => (
            <li key={b.id} className="border-border flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{b.file_name ?? `Parti #${b.id}`}</p>
                <p className="text-text-muted text-xs">
                  {fmtDate(b.created_at)} · {b.inserted_rows} eklendi{b.error_rows ? ` · ${b.error_rows} hata` : ''}
                  {b.undone_at && <span className="text-danger-foreground"> · geri alındı</span>}
                </p>
              </div>
              {!b.undone_at && (
                <Button variant="outline" size="sm" disabled={undo.isPending} onClick={async () => {
                  try {
                    const r = await undo.mutateAsync(b.id)
                    toast.success(`${r.undone} geri alındı${r.skipped ? `, ${r.skipped} korundu (çalışılmış)` : ''}.`)
                  } catch (err) { toast.error(await toUserMessage(err)) }
                }}>
                  <Undo2 className="size-4" /> Geri al
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <DialogFooter><Button onClick={onClose}>Kapat</Button></DialogFooter>
    </>
  )
}
