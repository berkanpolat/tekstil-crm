import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Pencil, FileText, Lock, Plus, Trash2, Loader2, Save, Download } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { env, hasPdfService, PDF_UNAVAILABLE } from '@/lib/env'
import { getSignedUrl } from '@/hooks/useFiles'
import { toUserMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { EmptyState } from '@/components/shared/EmptyState'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import {
  useCatalogProduct, useProductCost, useSaveProductCost, useHasPermission, useMarginTiers,
  useExchangeRates, ratesToMap, useDeleteCatalogProduct, type CatalogProductDetail, type CostItemRow,
} from '@/hooks/useCatalog'
import { sumCost, tierRows, type CostItem } from '@/lib/pricing'
import { CatalogImage } from './CatalogImage'
import { RateBadge } from './RateBadge'
import { CatalogProductForm } from './CatalogProductForm'
import { QuoteFromProductDialog } from './QuoteFromProductDialog'

const CUR = ['USD', 'TRY', 'EUR', 'GBP']
const ITEM_TYPES = [
  { value: 'kumas', label: 'Kumaş' }, { value: 'kesim_dikim_utu', label: 'Kesim/Dikim/Ütü' },
  { value: 'aksesuar', label: 'Aksesuar' }, { value: 'diger', label: 'Diğer' },
]
const usd = (n: number) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const trл = (n: number) => Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺'
// Kayıtlı maliyet kalemini pricing çekirdeğinin beklediği biçime çevirir (canlı kur hesabı için).
const toCostItem = (i: CostItemRow): CostItem => ({ calculation_type: (i.calculation_type as 'metre_fiyat' | 'sabit') || 'sabit', quantity: i.quantity, unit_price: i.unit_price, amount: i.amount, currency: i.currency || 'USD' })

export function CatalogProductPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const pid = Number(id)
  const { data: p, isLoading } = useCatalogProduct(pid)
  const [tab, setTab] = useState<'genel' | 'maliyet' | 'fiyat'>('genel')
  const [editOpen, setEditOpen] = useState(false)
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const canCost = useHasPermission('costs.view')
  const del = useDeleteCatalogProduct()

  if (isLoading || !p) return <div className="flex items-center gap-2 p-8 text-text-muted"><Loader2 className="size-4 animate-spin" /> Yükleniyor…</div>

  const TABS = [{ k: 'genel', l: 'Genel' }, { k: 'fiyat', l: 'Fiyat' }, ...(canCost.data ? [{ k: 'maliyet', l: 'Maliyet' }] : [])] as const

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/katalog')} className="flex items-center gap-1 text-sm text-text-secondary hover:text-foreground"><ArrowLeft className="size-4" /> Katalog</button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{p.name}</h1>
          <p className="text-text-secondary text-sm"><span className="font-mono">{p.code}</span> · {[p.category?.label, p.type?.label].filter(Boolean).join(' / ') || '—'} · {p.collection?.name ?? p.catalog?.name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RateBadge />
          <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="size-4" /> Düzenle</Button>
          <Button variant="outline" className="text-destructive" onClick={() => setDeleteOpen(true)}><Trash2 className="size-4" /> Sil</Button>
          <Button onClick={() => setQuoteOpen(true)}><FileText className="size-4" /> Teklif oluştur</Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Gallery product={p} />
        <div className="min-w-0">
          <div className="mb-4 flex gap-1 border-b border-border">
            {TABS.map((t) => (
              <button key={t.k} onClick={() => setTab(t.k as 'genel' | 'fiyat' | 'maliyet')} className={cn('border-b-2 px-3 py-2 text-sm font-medium', tab === t.k ? 'border-primary text-foreground' : 'border-transparent text-text-secondary hover:text-foreground')}>{t.l}</button>
            ))}
          </div>
          {tab === 'genel' && <TechInfo product={p} />}
          {tab === 'fiyat' && <PriceTab product={p} />}
          {tab === 'maliyet' && canCost.data && <CostTab product={p} />}
        </div>
      </div>

      {editOpen && <CatalogProductForm editing={p} onClose={() => setEditOpen(false)} onSaved={() => setEditOpen(false)} />}
      {quoteOpen && <QuoteFromProductDialog product={p} onClose={() => setQuoteOpen(false)} />}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Ürünü sil"
        description={`${p.name} (${p.code}) katalogdan kaldırılacak. Kayıt gizlenir; geçmiş teklif/sipariş belgeleri etkilenmez.`}
        confirmLabel="Sil"
        destructive
        onConfirm={async () => {
          try {
            await del.mutateAsync(p.id)
            toast.success('Ürün silindi.')
            navigate('/katalog')
          } catch (err) {
            toast.error(await toUserMessage(err))
          }
        }}
      />
    </div>
  )
}

function Gallery({ product }: { product: CatalogProductDetail }) {
  const imgs = [...(product.images ?? [])].sort((a, b) => a.sort_order - b.sort_order)
  const [sel, setSel] = useState(0)
  if (!imgs.length) return <CatalogImage path={null} alt="" className="aspect-[3/4] w-full rounded-lg" />
  return (
    <div className="space-y-2">
      <CatalogImage path={imgs[sel]?.files?.storage_path ?? null} alt={product.name} width={600} contain className="aspect-[3/4] w-full rounded-lg border border-border bg-muted/30" />
      {imgs.length > 1 && (
        <div className="flex gap-2">
          {imgs.map((im, i) => (
            <button key={im.id} onClick={() => setSel(i)} className={cn('overflow-hidden rounded border-2', i === sel ? 'border-primary' : 'border-transparent')}>
              <CatalogImage path={im.files?.storage_path ?? null} alt="" className="size-14" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TechInfo({ product }: { product: CatalogProductDetail }) {
  const rows: [string, string | null][] = [
    ['Ürün Kodu', product.code], ['Kategori', product.category?.label ?? null], ['Tür', product.type?.label ?? null],
    ['Kompozisyon', product.composition], ['MOQ', String(product.moq)], ['Beden Sistemi', product.size_system],
    ['Bedenler', (product.sizes ?? []).join(', ') || null],
    ['Renkler', ((product.colors as string[] | null) ?? []).join(', ') || null],
    ['Koleksiyon', product.collection?.name ?? null],
  ]
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-1 divide-y divide-border rounded-lg border border-border sm:grid-cols-2 sm:divide-y-0">
        {rows.map(([k, v], i) => (
          <div key={k} className={cn('px-4 py-3', i % 2 === 0 ? 'sm:border-r border-border' : '', 'sm:border-b')}>
            <dt className="text-xs text-text-muted">{k}</dt><dd className="mt-0.5 text-sm text-foreground">{v || '—'}</dd>
          </div>
        ))}
      </dl>
      {product.description && <div className="rounded-lg border border-border p-4"><div className="text-xs text-text-muted">Açıklama</div><p className="mt-1 text-sm text-foreground">{product.description}</p></div>}
    </div>
  )
}

// ── Fiyat kademeleri (P4B.6) ────────────────────────────────────────────────
function PriceTab({ product }: { product: CatalogProductDetail }) {
  const cost = useProductCost(product.id)
  const tiers = useMarginTiers()
  const rates = useExchangeRates()
  const canCost = useHasPermission('costs.view')
  const rateMap = ratesToMap(rates.data)
  const items = cost.data?.items
  // Birim maliyet GÜNCEL kurla hesaplanır (donmuş total_cost_usd yerine); kalem yoksa donmuşa düşer.
  const unitCostUsd = useMemo(
    () => (items?.length ? sumCost(items.map(toCostItem), rateMap).totalUsd : cost.data?.total_cost_usd ?? null),
    [items, rateMap, cost.data?.total_cost_usd],
  )
  const rows = useMemo(() => unitCostUsd != null ? tierRows(unitCostUsd, tiers.data ?? [], product.custom_margin_percent) : [], [unitCostUsd, tiers.data, product.custom_margin_percent])

  if (unitCostUsd == null) return (
    <EmptyState icon={FileText} title="Fiyat için maliyet gerekli"
      description={canCost.data ? 'Önce "Maliyet" sekmesinden reçete girin; fiyat kademeleri otomatik hesaplanır.' : 'Bu ürünün maliyeti henüz girilmemiş.'} />
  )
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">Birim maliyet <b>{usd(unitCostUsd)}</b>{product.custom_margin_percent != null && <span> · ürüne özel marj %{product.custom_margin_percent}</span>}</p>
      <p className="text-xs text-text-muted">Güncel kurla hesaplandı — teklif/belgedeki fiyat kayıt anındaki kura sabittir, farklı olabilir.</p>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-text-muted"><tr>
            {['Adet', 'Birim Maliyet', 'Marj', 'Birim Fiyat', 'Toplam'].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.quantity} className="border-t border-border">
                <td className="px-3 py-2">{r.quantity}</td><td className="px-3 py-2">{usd(r.unitCost)}</td>
                <td className="px-3 py-2">%{r.marginPercent}</td><td className="px-3 py-2 font-medium">{usd(r.unitPrice)}</td>
                <td className="px-3 py-2">{usd(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Maliyet belgesi (P4B.7) — İÇ KULLANIM; on-demand üretilir+indirilir, persist edilmez ──
function CostDocButton({ product, cost, rateMap, rateInfo }: { product: CatalogProductDetail; cost: { version: number; total_cost_try: number; total_cost_usd: number; items: CostItemRow[] }; rateMap: { USD?: number }; rateInfo?: { source?: string; fetched_at?: string | null } }) {
  const tiers = useMarginTiers()
  const [busy, setBusy] = useState(false)
  async function download() {
    setBusy(true)
    try {
      let image = ''
      const img = [...(product.images ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0]
      if (img?.files?.storage_path) {
        try { const url = await getSignedUrl('documents', img.files.storage_path, 120); const blob = await (await fetch(url)).blob(); image = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result || '')); r.onerror = () => res(''); r.readAsDataURL(blob) }) } catch { /* görselsiz */ }
      }
      const rows = tierRows(cost.total_cost_usd, tiers.data ?? [], product.custom_margin_percent)
      const maliyet = {
        code: product.code, name: product.name, category: [product.category?.label, product.type?.label].filter(Boolean).join(' / '), composition: product.composition, image,
        items: cost.items.map((i) => ({ name: i.name, detail: i.calculation_type === 'metre_fiyat' ? `${i.quantity} m × ${i.unit_price} ${i.currency}` : `${i.currency}`, amount: (i.calculation_type === 'metre_fiyat' ? Number(i.quantity) * Number(i.unit_price) : Number(i.amount)).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' ' + i.currency })),
        totalTry: trл(cost.total_cost_try), totalUsd: usd(cost.total_cost_usd),
        rateSource: rateInfo?.source ?? 'TCMB', usdRate: (rateMap.USD ?? 0).toFixed(2), rateDate: rateInfo?.fetched_at ? new Date(rateInfo.fetched_at).toLocaleDateString('tr-TR') : '',
        tiers: rows.map((r) => ({ qty: r.quantity, unitCost: usd(r.unitCost), margin: r.marginPercent, unitPrice: usd(r.unitPrice), total: usd(r.total) })),
        hazirlayan: '—', tarih: new Date().toLocaleDateString('tr-TR'), versiyon: cost.version,
      }
      if (!hasPdfService) throw new Error(PDF_UNAVAILABLE)
      const res = await fetch(env.pdfServiceUrl.replace(/\/$/, '') + '/render', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ template: 'maliyet_belgesi', data: { maliyet }, language: 'tr' }) })
      if (!res.ok) throw new Error(`PDF servisi hatası (${res.status}).`)
      const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `maliyet-${product.code}.pdf`; document.body.appendChild(a); a.click(); a.remove()
      toast.success('Maliyet belgesi indirildi (İç Kullanım).')
    } catch (err) { toast.error(await toUserMessage(err)) } finally { setBusy(false) }
  }
  return <Button size="sm" variant="outline" onClick={() => void download()} disabled={busy}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} Maliyet belgesi</Button>
}

// ── Maliyet reçetesi (P4B.4) — costs.view ile görünür, costs.edit ile düzenlenir ──
function CostTab({ product }: { product: CatalogProductDetail }) {
  const cost = useProductCost(product.id)
  const canEdit = useHasPermission('costs.edit')
  const save = useSaveProductCost()
  const rates = useExchangeRates()
  const [editing, setEditing] = useState(false)
  const [items, setItems] = useState<Partial<CostItemRow>[]>([])
  const [notes, setNotes] = useState('')

  const rateMap = ratesToMap(rates.data)
  const liveItems: CostItem[] = items.map((it) => ({ calculation_type: (it.calculation_type as 'metre_fiyat' | 'sabit') || 'sabit', quantity: it.quantity, unit_price: it.unit_price, amount: it.amount, currency: it.currency || 'USD' }))
  const total = sumCost(liveItems, rateMap)

  function startEdit() {
    setItems(cost.data?.items?.length ? cost.data.items.map((i) => ({ ...i })) : [
      { item_type: 'kumas', name: 'Kumaş', calculation_type: 'metre_fiyat', currency: 'USD', fabric_name: '' },
      { item_type: 'kesim_dikim_utu', name: 'Kesim/Dikim/Ütü', calculation_type: 'sabit', currency: 'TRY' },
      { item_type: 'aksesuar', name: 'Aksesuar', calculation_type: 'sabit', currency: 'TRY' },
    ])
    setNotes(cost.data?.notes ?? ''); setEditing(true)
  }
  async function doSave() {
    const clean = items.filter((i) => (i.name || '').trim())
    try {
      await save.mutateAsync({
        productId: product.id,
        items: clean.map((i, idx) => ({ item_type: i.item_type || 'diger', name: i.name, calculation_type: i.calculation_type || 'sabit', quantity: i.quantity ?? null, unit_price: i.unit_price ?? null, amount: i.amount ?? null, currency: i.currency || 'USD', fabric_name: i.item_type === 'kumas' ? (i.fabric_name ?? null) : null, sort_order: idx })),
        totalTry: total.totalTry, totalUsd: total.totalUsd, rates: { ...rateMap, _source: rates.data?.source, _at: rates.data?.fetched_at }, notes: notes.trim() || null,
      })
      toast.success('Maliyet kaydedildi (yeni sürüm).'); setEditing(false)
    } catch (err) { toast.error(await toUserMessage(err)) }
  }
  const upd = (i: number, patch: Partial<CostItemRow>) => setItems((s) => s.map((x, j) => j === i ? { ...x, ...patch } : x))

  if (!editing) {
    const c = cost.data
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-text-secondary">{c ? `Sürüm ${c.version} · ${new Date(c.created_at).toLocaleDateString('tr-TR')}` : 'Maliyet girilmemiş.'}</p>
          <div className="flex gap-2">
            {c && <CostDocButton product={product} cost={c} rateMap={rateMap} rateInfo={rates.data} />}
            {canEdit.data && <Button size="sm" onClick={startEdit}><Pencil className="size-3.5" /> {c ? 'Yeni sürüm' : 'Maliyet gir'}</Button>}
          </div>
        </div>
        {c && (
          <>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm"><thead className="bg-muted/50 text-xs text-text-muted"><tr>{['Kalem', 'Hesap', 'Tutar', 'Kumaş'].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr></thead>
                <tbody>{c.items.map((i) => (
                  <tr key={i.id} className="border-t border-border">
                    <td className="px-3 py-2">{i.name}</td>
                    <td className="px-3 py-2 text-text-secondary">{i.calculation_type === 'metre_fiyat' ? `${i.quantity} m × ${i.unit_price} ${i.currency}` : `${i.amount} ${i.currency}`}</td>
                    <td className="px-3 py-2">{i.calculation_type === 'metre_fiyat' ? Number(i.quantity) * Number(i.unit_price) : i.amount} {i.currency}</td>
                    <td className="px-3 py-2 text-text-muted">{i.fabric_name ?? '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="flex justify-end gap-6 text-sm"><span>Toplam: <b>{trл(sumCost(c.items.map(toCostItem), rateMap).totalTry)}</b></span><span>≈ <b>{usd(sumCost(c.items.map(toCostItem), rateMap).totalUsd)}</b></span></div>
            <p className="text-right text-xs text-text-muted">Güncel kurla hesaplandı (kayıt anı: {trл(c.total_cost_try)} · {usd(c.total_cost_usd)}).</p>
            <p className="flex items-center gap-1 text-xs text-warning-foreground"><Lock className="size-3.5" /> Maliyet iç kullanımdır; müşteriye giden belgelerde görünmez.</p>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {rates.data?.blocked && <p className="text-xs text-danger-foreground">Kur {rates.data.age_hours} saat eski — hesap güncel olmayabilir.</p>}
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="rounded-md border border-border p-2.5">
            <div className="flex items-center justify-between mb-2">
              <SearchableSelect className="w-40" options={ITEM_TYPES} value={it.item_type || 'diger'} onChange={(v) => upd(i, { item_type: v || 'diger' })} />
              <Button size="icon" variant="ghost" className="size-7 text-destructive" onClick={() => setItems((s) => s.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></Button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div><Label className="text-xs text-text-muted">Ad</Label><Input value={it.name ?? ''} onChange={(e) => upd(i, { name: e.target.value })} className="mt-1" /></div>
              <div><Label className="text-xs text-text-muted">Hesap</Label><SearchableSelect className="mt-1" options={[{ value: 'metre_fiyat', label: 'Metre × Fiyat' }, { value: 'sabit', label: 'Sabit tutar' }]} value={it.calculation_type || 'sabit'} onChange={(v) => upd(i, { calculation_type: v || 'sabit' })} /></div>
              {it.calculation_type === 'metre_fiyat' ? (
                <>
                  <div><Label className="text-xs text-text-muted">Metre</Label><MoneyInput value={it.quantity ?? null} onValueChange={(n) => upd(i, { quantity: n })} className="mt-1" placeholder="0" /></div>
                  <div><Label className="text-xs text-text-muted">Birim Fiyat</Label><MoneyInput value={it.unit_price ?? null} onValueChange={(n) => upd(i, { unit_price: n })} className="mt-1" /></div>
                </>
              ) : (
                <div className="col-span-2"><Label className="text-xs text-text-muted">Tutar</Label><MoneyInput value={it.amount ?? null} onValueChange={(n) => upd(i, { amount: n })} className="mt-1" /></div>
              )}
              <div><Label className="text-xs text-text-muted">Para</Label><SearchableSelect className="mt-1" options={CUR.map((c) => ({ value: c, label: c }))} value={it.currency || 'USD'} onChange={(v) => upd(i, { currency: v || 'USD' })} /></div>
              {it.item_type === 'kumas' && <div className="col-span-2 sm:col-span-3"><Label className="text-xs text-text-muted">Kumaş adı (teklife otomatik gelir)</Label><Input value={it.fabric_name ?? ''} onChange={(e) => upd(i, { fabric_name: e.target.value })} className="mt-1" placeholder="ör. 320g süprem pamuk" /></div>}
            </div>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => setItems((s) => [...s, { item_type: 'diger', name: '', calculation_type: 'sabit', currency: 'USD' }])}><Plus className="size-3.5" /> Kalem ekle</Button>
      </div>
      <div><Label className="text-xs text-text-muted">Not</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1" /></div>
      <div className="flex items-center justify-between border-t border-border pt-3">
        <div className="text-sm">Toplam: <b>{trл(total.totalTry)}</b> ≈ <b>{usd(total.totalUsd)}</b> <span className="text-xs text-text-muted">(kur: {rates.data?.source} 1$={rateMap.USD?.toFixed(2)}₺)</span></div>
        <div className="flex gap-2"><Button variant="outline" onClick={() => setEditing(false)}>Vazgeç</Button><Button onClick={() => void doSave()} disabled={save.isPending}>{save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Kaydet</Button></div>
      </div>
    </div>
  )
}
