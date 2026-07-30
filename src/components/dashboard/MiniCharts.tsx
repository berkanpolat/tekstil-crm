import { useMemo } from 'react'
import { cn } from '@/lib/utils'

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

/** Dönüşüm hunisi — azalan genişlikte yatay bloklar + adım oranları. */
export function Funnel({ stages }: { stages: { label: string; value: number; rate?: number | null }[] }) {
  const max = Math.max(1, ...stages.map((s) => s.value))
  return (
    <div className="space-y-1.5">
      {stages.map((s, i) => (
        <div key={s.label} className="flex items-center gap-2">
          <span className="text-text-secondary w-20 shrink-0 text-xs">{s.label}</span>
          <div className="flex h-7 flex-1 items-center overflow-hidden rounded bg-muted">
            <div className="flex h-full items-center rounded bg-accent-primary/80 px-2 text-xs font-semibold text-white transition-all"
              style={{ width: `${Math.max(8, (s.value / max) * 100)}%` }}>
              {s.value}
            </div>
          </div>
          <span className="text-text-secondary w-14 shrink-0 text-right text-xs tabular-nums">
            {i > 0 && s.rate != null ? `%${s.rate.toFixed(0)}` : ''}
          </span>
        </div>
      ))}
    </div>
  )
}
