import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Save } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toUserMessage } from '@/lib/errors'
import { PageHeader } from '@/components/shared/PageHeader'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useMarketingChannelOptions } from '@/hooks/useOperations'
import { parseDecimal } from '@/lib/money'

// ── Ayarlar → Pazarlama Harcaması ────────────────────────────────────────
// Izgara: satır = son 12 ay, sütun = aktif pazarlama kanalı, hücre = aylık tutar.
// Genel Rapor bu tutarı dönemle kesişen ay(lar) gün oranında paylaştırıp CPL/CPA üretir.
// Okuma reports.finance, yazma settings.manage (RLS).

const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
function sonAylar(n = 12): string[] {
  const out: string[] = []; const d = new Date(); d.setDate(1)
  for (let i = 0; i < n; i++) { out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`); d.setMonth(d.getMonth() - 1) }
  return out
}
const ayEtiket = (iso: string) => `${AY[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`
const hucreKey = (ch: number, ay: string) => `${ch}|${ay}`

export function MarketingSpendSettings() {
  const qc = useQueryClient()
  const kanallar = useMarketingChannelOptions()
  const aylar = useMemo(() => sonAylar(12), [])
  const spend = useQuery({
    queryKey: ['marketing-spend'],
    queryFn: async () => (await supabase.from('marketing_spend').select('channel_id, month, amount').gte('month', aylar[aylar.length - 1]!)).data ?? [],
  })
  // Sunucu değerleri + kullanıcı düzenlemeleri (effect'te setState yok; kaydedince düzenlemeler sıfırlanır)
  const base = useMemo(() => Object.fromEntries((spend.data ?? []).map((r) => [hucreKey(r.channel_id, String(r.month).slice(0, 10)), String(r.amount)])), [spend.data])
  const [edits, setEdits] = useState<Record<string, string>>({})
  const form = useMemo(() => ({ ...base, ...edits }), [base, edits])
  const setForm = (fn: (f: Record<string, string>) => Record<string, string>) => setEdits((e) => { const next = fn({ ...base, ...e }); const d: Record<string, string> = {}; for (const [k, v] of Object.entries(next)) if ((base[k] ?? '') !== v) d[k] = v; return d })
  const [busy, setBusy] = useState(false)
  // Yalnız reklam kanalları (elle giriş kanallarına harcama girilmez)
  const reklamKanallari = (kanallar.data ?? []).filter((k) => !['data', 'dis_arama', 'gelen_arama', 'dogrudan', 'organik', 'yapay_zeka', 'bilinmiyor'].includes(k.key))
  const toplam = (ay: string) => reklamKanallari.reduce((a, k) => a + (parseDecimal(form[hucreKey(k.id, ay)] ?? '') ?? 0), 0)

  async function submit() {
    setBusy(true)
    try {
      const rows: { channel_id: number; month: string; amount: number }[] = []
      const sil: { channel_id: number; month: string }[] = []
      for (const k of reklamKanallari) for (const ay of aylar) {
        const v = (form[hucreKey(k.id, ay)] ?? '').trim()
        if (v === '') sil.push({ channel_id: k.id, month: ay })
        else { const n = parseDecimal(v); if (n != null && n >= 0) rows.push({ channel_id: k.id, month: ay, amount: n }) }
      }
      if (rows.length) { const { error } = await supabase.from('marketing_spend').upsert(rows as never, { onConflict: 'channel_id,month' }); if (error) throw error }
      for (const s of sil) { const { error } = await supabase.from('marketing_spend').delete().eq('channel_id', s.channel_id).eq('month', s.month); if (error) throw error }
      setEdits({}); qc.invalidateQueries({ queryKey: ['marketing-spend'] }); qc.invalidateQueries({ queryKey: ['metric'] })
      toast.success('Reklam harcaması kaydedildi.')
    } catch (e) { toast.error(await toUserMessage(e)) } finally { setBusy(false) }
  }

  if (kanallar.isLoading || spend.isLoading) return <div className="space-y-4"><PageHeader title="Pazarlama Harcaması" description="Kanal × ay reklam bütçesi." /><Skeleton className="h-64 w-full" /></div>
  return (
    <div className="space-y-4">
      <PageHeader title="Pazarlama Harcaması" description="Aylık reklam harcaması, kanal başına. Genel Rapor'da talep başı (CPL) ve sipariş başı (CPA) maliyet buradan hesaplanır." />
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-text-muted">
            <tr><th className="px-3 py-2 text-left font-medium">Ay</th>{reklamKanallari.map((k) => <th key={k.id} className="px-2 py-2 text-right font-medium whitespace-nowrap">{k.label}</th>)}<th className="px-3 py-2 text-right font-medium">Toplam</th></tr>
          </thead>
          <tbody>
            {aylar.map((ay) => (
              <tr key={ay} className="border-t border-border">
                <td className="px-3 py-1.5 whitespace-nowrap">{ayEtiket(ay)}</td>
                {reklamKanallari.map((k) => (
                  <td key={k.id} className="px-2 py-1">
                    <Input inputMode="decimal" className="h-8 w-28 text-right tabular-nums" placeholder="0" value={form[hucreKey(k.id, ay)] ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, [hucreKey(k.id, ay)]: e.target.value.replace(/[^0-9.,]/g, '') }))} />
                  </td>
                ))}
                <td className="px-3 py-1.5 text-right tabular-nums font-medium">{toplam(ay).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-text-muted text-xs">Para birimi ayarı: <code>marketing.spend_currency</code> (varsayılan TRY). Boş hücre = harcama yok. Kampanya bazında harcama girilmez; kanal toplamı yeter.</p>
      <Button onClick={() => void submit()} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Kaydet</Button>
    </div>
  )
}
