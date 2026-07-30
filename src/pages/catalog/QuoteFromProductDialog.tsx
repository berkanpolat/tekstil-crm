import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2, AlertTriangle, FileText, Plus, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getSignedUrl } from '@/hooks/useFiles'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useExchangeRates, useMarginTiers, type CatalogProductDetail } from '@/hooks/useCatalog'

interface PriceInfo { has_cost: boolean; unit_price_usd?: number; fabric_name?: string; margin_percent?: number | null }
const usd = (n: number) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** P4B.8 + QA#5 — Katalogdan ÇOKLU KADEME teklif: 50/200/500 gibi birden çok adet seçilir,
 *  her biri server fiyatıyla (maliyet sızmadan) belgeye AYRI SATIR olarak gelir. */
export function QuoteFromProductDialog({ product, onClose }: { product: CatalogProductDetail; onClose: () => void }) {
  const navigate = useNavigate()
  const rates = useExchangeRates()
  const tiers = useMarginTiers()
  const [musteri, setMusteri] = useState('')
  const [qtys, setQtys] = useState<number[]>(() => [Math.max(1, product.moq || 50)])
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)

  // margin_tiers'tan önerilen kademeler (MOQ altındakiler atlanır).
  const suggested = (tiers.data ?? []).map((t) => t.min_quantity).filter((q) => q >= (product.moq || 1))
  const sorted = [...qtys].sort((a, b) => a - b)

  const toggle = (q: number) => setQtys((prev) => prev.includes(q) ? prev.filter((x) => x !== q) : [...prev, q])
  const addCustom = () => { const n = parseInt(custom, 10); if (n > 0 && !qtys.includes(n)) { setQtys((p) => [...p, n]); setCustom('') } }

  // Her kademe için server fiyatı (adet kademesine göre marj). Maliyet costs.view yoksa dönmez.
  const prices = useQuery({
    queryKey: ['product-prices', product.id, sorted],
    enabled: sorted.length > 0,
    queryFn: async () => Promise.all(sorted.map(async (q) => ({
      q, info: (await supabase.rpc('product_price', { p_product_id: product.id, p_quantity: q })).data as unknown as PriceInfo,
    }))),
  })
  const rows = prices.data ?? []
  const blocked = rates.data?.blocked
  const allCosted = rows.length > 0 && rows.every((r) => r.info?.has_cost && r.info.unit_price_usd)
  const canQuote = sorted.length > 0 && allCosted && !blocked

  async function prepare() {
    if (!allCosted) return
    setBusy(true)
    let foto = ''; let fotoAR = 0.75
    try {
      const img = [...(product.images ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0]
      if (img?.files?.storage_path) {
        const url = await getSignedUrl('documents', img.files.storage_path, 120)
        const blob = await (await fetch(url)).blob()
        foto = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result || '')); r.onerror = () => res(''); r.readAsDataURL(blob) })
        fotoAR = 0.75
      }
    } catch { /* görselsiz devam */ }
    const kumas = rows[0]?.info.fabric_name ?? product.composition ?? ''
    const opts = rows.map((r) => ({
      detay: product.name, kumas, adet: String(r.q), birim: String(r.info.unit_price_usd ?? ''), oner: false,
    }))
    const prefill = {
      _fromCatalog: true,
      tkS: {
        talep: '', musteri: musteri.trim(), grup: product.category?.label ?? '', tur: product.type?.label ?? '',
        gecerli: '7 Gün', teslimat: '', odeme: '', para: 'USD', kdv: '10', indirim: '0', not: '', dil: 'tr',
        foto, fotoAR, opts,
      },
    }
    navigate('/belgeler/yeni/fiyat_teklifi', { state: { prefill } })
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Teklif oluştur — {product.name}</DialogTitle>
          <DialogDescription>Birden çok adet kademesi seçin; her biri fiyatıyla belgeye ayrı satır gelir.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-sm">Müşteri</Label><Input value={musteri} onChange={(e) => setMusteri(e.target.value)} placeholder="Müşteri adı" className="mt-1" /></div>

          <div>
            <Label className="text-sm">Adet kademeleri <span className="text-text-muted">(MOQ: {product.moq})</span></Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {suggested.map((q) => (
                <button key={q} type="button" onClick={() => toggle(q)}
                  className={cn('rounded-full border px-3 py-1 text-sm', qtys.includes(q) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-secondary')}>
                  {q} adet
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Input inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }} placeholder="Özel adet" className="w-32" />
              <Button type="button" size="sm" variant="outline" onClick={addCustom} disabled={!custom}><Plus className="size-3.5" /> Ekle</Button>
            </div>
          </div>

          {/* Seçili kademeler + fiyat tablosu */}
          {sorted.length > 0 && (
            <div className="overflow-hidden rounded-md border border-border">
              {prices.isFetching ? (
                <div className="flex items-center gap-1 p-3 text-sm text-text-muted"><Loader2 className="size-3.5 animate-spin" /> hesaplanıyor…</div>
              ) : !allCosted ? (
                <div className="p-3 text-sm text-warning-foreground">Bu ürünün maliyeti girilmemiş — fiyat hesaplanamaz. Elle teklif için belge editörünü kullanın.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-text-muted"><tr>
                    {['Adet', 'Birim Fiyat', 'Toplam', ''].map((h) => <th key={h} className={cn('px-3 py-1.5 font-medium', h === 'Adet' || h === '' ? 'text-left' : 'text-right')}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.q} className="border-t border-border">
                        <td className="px-3 py-1.5 font-medium">{r.q}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{usd(r.info.unit_price_usd!)}{r.info.margin_percent != null && <span className="ml-1 text-[11px] text-text-muted">%{r.info.margin_percent}</span>}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-medium">{usd(r.info.unit_price_usd! * r.q)}</td>
                        <td className="px-2 py-1.5 text-right"><button type="button" onClick={() => toggle(r.q)} className="text-text-muted hover:text-destructive"><X className="size-3.5" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {allCosted && rows[0]?.info.fabric_name && <div className="border-t border-border px-3 py-1.5 text-xs text-text-muted">Kumaş: {rows[0].info.fabric_name}</div>}
            </div>
          )}

          {blocked && <p className="flex items-center gap-1.5 text-xs text-danger-foreground"><AlertTriangle className="size-3.5" /> Kur {rates.data?.age_hours} saatten eski — teklif engellendi. Kur güncellenmeli.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Vazgeç</Button>
          <Button onClick={() => void prepare()} disabled={!canQuote || busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />} Teklif hazırla ({sorted.length} kademe)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
