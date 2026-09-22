import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HuniSatiri } from '@/hooks/useMetrics'
import { dusukVeri, oranMetni, siralaHuni, toplamSatiri, type HuniSiraAnahtari } from '@/lib/reportFunnel'

// ── Kanal × Huni tablosu ────────────────────────────────────────────────
// Bir kırılımın (kanal / kampanya / il) her satırı için talep → teklif → numune → sipariş
// sayıları ve oranları; hız sütunları isteğe bağlı. Düşük veri satırları soluk, oranı "—".
// Satır tıklanınca üst bileşen kırılıma "iner" (kanal filtresi).

const fmtH = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sa`)

function Hucre({ n, oran, max, tone = 'bg-accent-primary' }: { n: number; oran: string; max: number; tone?: string }) {
  return (
    <div className="min-w-[88px]">
      <div className="flex items-baseline justify-between gap-2 tabular-nums">
        <span className="text-foreground font-medium">{n}</span>
        <span className="text-text-secondary text-xs">{oran}</span>
      </div>
      <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${max > 0 ? (100 * n) / max : 0}%` }} />
      </div>
    </div>
  )
}

export function ChannelFunnelTable({ rows, labelHeader = 'Kanal', minBase, showSpeed = true, showCost = false, paraBirimi = 'TRY', onRowClick, compact = false, empty = 'Veri yok.' }: {
  rows: HuniSatiri[]; labelHeader?: string; minBase: number; showSpeed?: boolean; showCost?: boolean; paraBirimi?: string
  onRowClick?: (row: HuniSatiri) => void; compact?: boolean; empty?: string
}) {
  const para = (v: number | null | undefined) => (v == null ? '—' : `${v.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ${paraBirimi}`)
  const [sort, setSort] = useState<{ key: HuniSiraAnahtari; dir: 'asc' | 'desc' }>({ key: 'talep', dir: 'desc' })
  const sorted = useMemo(() => siralaHuni(rows, sort.key, sort.dir), [rows, sort])
  const toplam = useMemo(() => toplamSatiri(rows), [rows])
  const max = Math.max(1, ...rows.map((r) => r.talep))
  if (!rows.length) return <p className="text-text-secondary py-3 text-sm">{empty}</p>
  const th = (key: HuniSiraAnahtari, label: string, align: 'left' | 'right' = 'right') => (
    <th key={key} className={cn('cursor-pointer select-none py-1.5 pr-3 font-medium whitespace-nowrap', align === 'right' ? 'text-right' : 'text-left')}
      onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))}
      title="Sırala">
      <span className="inline-flex items-center gap-1">{label}{sort.key === key && (sort.dir === 'desc' ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}</span>
    </th>
  )
  const satir = (r: HuniSatiri, toplamMi = false) => {
    const zayif = !toplamMi && dusukVeri(r, minBase)
    return (
      <tr key={r.key} className={cn('border-b border-border/50 last:border-0', toplamMi && 'bg-muted/40 font-semibold', zayif && 'text-text-muted', onRowClick && !toplamMi && 'cursor-pointer hover:bg-muted/30')}
        onClick={() => !toplamMi && onRowClick?.(r)} title={zayif ? `Düşük veri (talep < ${minBase}) — oranlar gösterilmez` : undefined}>
        <td className="py-2 pr-3 whitespace-nowrap">
          <div className="text-foreground">{r.label}</div>
          {!compact && r.onceki_talep > 0 && !toplamMi && (
            <div className="text-text-muted text-[11px] tabular-nums">önceki {r.onceki_talep}{r.degisim_pct != null && <> · {r.degisim_pct > 0 ? '▲' : r.degisim_pct < 0 ? '▼' : '='} %{Math.abs(r.degisim_pct).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</>}</div>
          )}
        </td>
        <td className="py-2 pr-3 text-right tabular-nums">{r.talep}</td>
        <td className="py-2 pr-3"><Hucre n={r.teklif} oran={zayif ? '—' : oranMetni(r.teklif, r.talep, minBase)} max={max} /></td>
        <td className="py-2 pr-3"><Hucre n={r.numune} oran={zayif ? '—' : oranMetni(r.numune, r.teklif, minBase)} max={max} /></td>
        <td className="py-2 pr-3"><Hucre n={r.siparis} oran={zayif ? '—' : oranMetni(r.siparis, r.talep, minBase)} max={max} tone="bg-success-foreground" /></td>
        <td className="py-2 pr-3"><Hucre n={r.reddedilen} oran={zayif ? '—' : oranMetni(r.reddedilen, r.talep, minBase)} max={max} tone="bg-danger-foreground" /></td>
        <td className="py-2 pr-3 text-right tabular-nums">{r.bekleyen}</td>
        {showSpeed && (<>
          <td className="py-2 pr-3 text-right tabular-nums">{fmtH(r.ilk_yanit_saat)}</td>
          <td className="py-2 pr-3 text-right tabular-nums">{zayif ? '—' : oranMetni(r.sla_met, r.sla_met + r.sla_missed, minBase)}</td>
          <td className="py-2 pr-3 text-right tabular-nums">{fmtH(r.teklif_yanit_saat)}</td>
        </>)}
        {showCost && (<>
          <td className="py-2 pr-3 text-right tabular-nums">{toplamMi ? para(rows.reduce((a, x) => a + (x.harcama ?? 0), 0)) : para(r.harcama)}</td>
          <td className="py-2 pr-3 text-right tabular-nums">{toplamMi ? '—' : para(r.cpl)}</td>
          <td className="py-2 text-right tabular-nums">{toplamMi ? '—' : para(r.cpa)}</td>
        </>)}
      </tr>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-text-secondary border-b border-border text-xs">
            <th className="py-1.5 pr-3 text-left font-medium">{labelHeader}</th>
            {th('talep', 'Talep')}
            {th('teklif', 'Teklif (n · %)', 'left')}
            {th('numune', 'Numune (n · % teklif)', 'left')}
            {th('siparis', 'Sipariş (n · % talep)', 'left')}
            {th('reddedilen', 'Red (n · %)', 'left')}
            <th className="py-1.5 pr-3 text-right font-medium">Bekleyen</th>
            {showSpeed && (<>{th('ilk_yanit_saat', 'İlk yanıt')}{th('sla_orani', '24s sözü')}<th className="py-1.5 pr-3 text-right font-medium whitespace-nowrap">Teklif yanıt</th></>)}
            {showCost && (<><th className="py-1.5 pr-3 text-right font-medium">Harcama</th><th className="py-1.5 pr-3 text-right font-medium">CPL</th><th className="py-1.5 text-right font-medium">CPA</th></>)}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => satir(r))}
          {rows.length > 1 && satir(toplam, true)}
        </tbody>
      </table>
      <p className="text-text-muted mt-1 text-[11px]">Oranlar: teklif ve sipariş ÷ talep; numune ÷ teklif. Talep sayısı {minBase}'in altındaki satırlarda oran gösterilmez. Başlığa tıklayarak sıralayın{onRowClick ? '; satıra tıklayınca o kırılıma inersiniz' : ''}.</p>
    </div>
  )
}
