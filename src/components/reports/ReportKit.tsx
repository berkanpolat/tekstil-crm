import { useMemo, useState } from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { PERIODS, type Period, type PeriodKey } from '@/hooks/useMetrics'
import {
  funnelSvg, hourHistogramSvg, donutSvg, CHART_PALETTE,
  type FunnelStep, type DonutSegment, type ReportPdfModel,
} from '@/lib/reportChartSvg'
// Grafik geometrisi + PDF modeli tek kaynak (reportChartSvg); buradan yeniden dışa verilir.
export type { FunnelStep, DonutSegment, ReportKpi, ReportBlock, ReportPdfModel } from '@/lib/reportChartSvg'

/** Rapor gövdesi sözleşmesi — CSV + PDF dışa aktarımını kabuğa bildirir. */
export interface CsvExport { filename: string; headers: string[]; rows: (string | number | null)[][] }
export interface ReportProps {
  period: Period
  setCsv: (b: CsvExport | null) => void
  setPdf: (m: ReportPdfModel | null) => void
}

// datetime-local <-> ISO dönüşümü (yerel saat; render'da argümanlı new Date güvenli).
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const fromLocalInput = (v: string): string => new Date(v).toISOString()

/** Dönem seçici — ön tanımlar + "Özel" seçilince tarih+saat aralığı (URL'de kalıcı). */
export function PeriodPicker({ period, onPick }: {
  period: Period; onPick: (k: PeriodKey, range?: { from: string; to: string }) => void
}) {
  const [from, setFrom] = useState(() => toLocalInput(period.from))
  const [to, setTo] = useState(() => toLocalInput(period.to))
  const isCustom = period.key === 'custom'
  const applyCustom = () => onPick('custom', { from: fromLocalInput(from), to: fromLocalInput(to) })
  return (
    <div className="space-y-2 print:hidden">
      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
        {PERIODS.map((p) => (
          <button key={p.key} type="button" onClick={() => (p.key === 'custom' ? applyCustom() : onPick(p.key))}
            className={cn('rounded-md px-3 py-1 text-sm font-medium transition-colors',
              period.key === p.key ? 'bg-accent-primary text-white' : 'text-text-secondary hover:bg-muted')}>
            {p.label}
          </button>
        ))}
      </div>
      {isCustom && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3">
          <label className="text-text-secondary flex flex-col gap-1 text-xs">Başlangıç
            <input type="datetime-local" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground" />
          </label>
          <label className="text-text-secondary flex flex-col gap-1 text-xs">Bitiş
            <input type="datetime-local" value={to} min={from} onChange={(e) => setTo(e.target.value)}
              className="rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground" />
          </label>
          <button type="button" onClick={applyCustom}
            className="rounded-md bg-accent-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-primary/90">
            Uygula
          </button>
        </div>
      )}
    </div>
  )
}

/** KPI kartı — büyük sayı + etiket + alt bilgi. onClick verilirse tıklanır (panelde gezinme). */
export function Kpi({ label, value, sub, tone, onClick }: {
  label: string; value: string; sub?: string; tone?: string; onClick?: () => void
}) {
  const cls = cn('bg-card flex flex-col gap-1 rounded-lg border border-border p-4 text-left shadow-card',
    onClick && 'hover:border-accent-primary/50 cursor-pointer transition-colors')
  const inner = (
    <>
      <div className="text-text-secondary text-xs font-medium">{label}</div>
      <div className={cn('text-2xl font-semibold tabular-nums', tone ?? 'text-foreground')}>{value}</div>
      {sub && <div className="text-text-muted text-xs">{sub}</div>}
    </>
  )
  return onClick
    ? <button type="button" onClick={onClick} className={cls}>{inner}</button>
    : <div className={cls}>{inner}</div>
}

/** Rapor bölümü başlığı + içerik kutusu. */
export function ReportSection({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('bg-card space-y-3 rounded-lg border border-border p-4 shadow-card break-inside-avoid', className)}>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  )
}

export interface Col { key: string; label: string; align?: 'left' | 'right'; tone?: (v: unknown, row: Record<string, unknown>) => string }

/** Basit veri tablosu — rapor kırılımları için. */
export function DataTable({ cols, rows, empty = 'Veri yok.' }: {
  cols: Col[]; rows: Record<string, unknown>[]; empty?: string
}) {
  if (!rows.length) return <p className="text-text-secondary py-3 text-sm">{empty}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-text-secondary border-b border-border text-left text-xs">
            {cols.map((c) => <th key={c.key} className={cn('py-1 font-medium', c.align === 'right' && 'text-right')}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/50 last:border-0">
              {cols.map((c) => (
                <td key={c.key} className={cn('py-1.5', c.align === 'right' ? 'text-right tabular-nums' : 'text-foreground', c.tone?.(r[c.key], r))}>
                  {r[c.key] as React.ReactNode}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Yükleniyor iskeleti — rapor gövdesi. */
export function ReportLoading() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      <Skeleton className="h-48" />
    </div>
  )
}

// ── Grafik bileşenleri (SAF SVG — reportChartSvg tek kaynak) ────────────
// Ekran ve PDF AYNI string üreticisini kullanır (funnelSvg/donutSvg/hourHistogramSvg);
// bu bileşenler yalnız o string'i basar. Böylece iki taraf tanım gereği birebir aynı.

/** Büyük rakam + altında açıklayıcı cümle ("100 talebin 52'sine 24 saatte yanıt"). */
export function Insight({ value, label, sentence, tone }: {
  value: string; label?: string; sentence: React.ReactNode; tone?: string
}) {
  return (
    <div className="bg-card break-inside-avoid space-y-1 rounded-lg border border-border p-4 shadow-card">
      {label && <div className="text-text-secondary text-xs font-medium">{label}</div>}
      <div className={cn('text-2xl font-semibold tabular-nums', tone ?? 'text-foreground')}>{value}</div>
      <p className="text-text-secondary text-sm leading-snug">{sentence}</p>
    </div>
  )
}

/** Yatay dönüşüm hunisi — her adımda ilerleyen (mor) vs takılıp bekleyen (amber). */
export function Funnel({ steps, width = 560, rowHeight = 52 }: { steps: FunnelStep[]; width?: number; rowHeight?: number }) {
  if (!steps.length) return null
  return <div dangerouslySetInnerHTML={{ __html: funnelSvg(steps, { width, rowHeight }) }} />
}

/** Saate göre dağılım — 0–23 dikey çubuklar (eksik saatler 0 çizilir). */
export function HourHistogram({ data, width = 560, height = 140 }: {
  data: { hour: number; count: number }[]; width?: number; height?: number
}) {
  return <div dangerouslySetInnerHTML={{ __html: hourHistogramSvg(data, { width, height }) }} />
}

/** Halka grafik — merkezde toplam. Legend ayrı (SwatchLegend), SAF SVG kalsın. */
export function Donut({ segments, size = 150, thickness = 24, centerLabel }: {
  segments: DonutSegment[]; size?: number; thickness?: number; centerLabel?: string
}) {
  return <div style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: donutSvg(segments, { size, thickness, centerLabel }) }} />
}

/** Grafik legend'ı (HTML) — Donut ile aynı paleti/sırayı paylaşır. */
export function SwatchLegend({ items }: { items: { label: string; value?: string | number; color?: string }[] }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {items.map((it, i) => (
        <li key={i} className="flex items-center gap-2">
          <span className="inline-block size-3 shrink-0 rounded-sm" style={{ background: it.color ?? CHART_PALETTE[i % CHART_PALETTE.length] }} />
          <span className="text-foreground">{it.label}</span>
          {it.value != null && <span className="text-text-secondary tabular-nums">{it.value}</span>}
        </li>
      ))}
    </ul>
  )
}

/** Hafif çizgi grafik (SVG, bağımlılıksız). points: günlük seri. */
export function TrendLine({ points, height = 96 }: { points: { day: string; count: number }[]; height?: number }) {
  const { path, area, peak, last } = useMemo(() => {
    if (!points.length) return { path: '', area: '', peak: 0, last: 0 }
    const W = 100, H = 100
    const mx = Math.max(1, ...points.map((p) => p.count))
    const step = points.length > 1 ? W / (points.length - 1) : W
    const pts = points.map((p, i) => [i * step, H - (p.count / mx) * H] as const)
    const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
    const ar = `${d} L${W},${H} L0,${H} Z`
    return { path: d, area: ar, peak: Math.max(...points.map((p) => p.count)), last: points.at(-1)?.count ?? 0 }
  }, [points])
  if (!points.length) return <p className="text-text-secondary py-6 text-center text-sm">Henüz veri yok.</p>
  return (
    <div className="space-y-1">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full text-accent-primary" style={{ height }} role="img" aria-label="Talep eğilimi">
        <path d={area} className="fill-accent-primary/10" />
        <path d={path} className="stroke-accent-primary" fill="none" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="text-text-secondary flex justify-between text-xs tabular-nums">
        <span>{points[0]?.day.slice(5)}</span>
        <span>zirve {peak} · bugün {last}</span>
        <span>{points[points.length - 1]?.day.slice(5)}</span>
      </div>
    </div>
  )
}

/** Yatay çubuk listesi (div bar). En büyük değere göre orantılı. */
export function BarList({ rows, barClass = 'bg-accent-primary', empty = 'Veri yok.' }: {
  rows: { label: string; count: number }[]; barClass?: string; empty?: string
}) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  if (!rows.length) return <p className="text-text-secondary py-4 text-sm">{empty}</p>
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="space-y-0.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-foreground truncate pr-2">{r.label}</span>
            <span className="text-text-secondary shrink-0 tabular-nums">{r.count}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className={cn('h-full rounded-full', barClass)} style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Veri yetersiz durumları: 'low' = eşik altı (amber), 'none' = toplanmıyor (nötr). */
export function LowDataNotice({ variant = 'low', title, children }: {
  variant?: 'low' | 'none'; title?: string; children?: React.ReactNode
}) {
  const isNone = variant === 'none'
  const Icon = isNone ? Info : AlertTriangle
  return (
    <div className={cn('flex items-start gap-2.5 rounded-lg border p-4 text-sm break-inside-avoid',
      isNone ? 'text-text-secondary border-border bg-muted/40' : 'text-text-secondary border-warning-foreground/30 bg-warning/10')}>
      <Icon className={cn('mt-0.5 size-4 shrink-0', isNone ? 'text-text-muted' : 'text-warning-foreground')} />
      <div className="space-y-0.5">
        {title && <div className="text-foreground font-medium">{title}</div>}
        {children && <div>{children}</div>}
      </div>
    </div>
  )
}
