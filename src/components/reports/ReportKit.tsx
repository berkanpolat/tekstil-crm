import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { PERIODS, type Period, type PeriodKey } from '@/hooks/useMetrics'

/** Rapor gövdesi sözleşmesi — CSV dışa aktarımını kabuğa bildirir. */
export interface CsvExport { filename: string; headers: string[]; rows: (string | number | null)[][] }
export interface ReportProps { period: Period; setCsv: (b: CsvExport | null) => void }

/** Dönem seçici — panel + raporlarda ortak (URL'de kalıcı). */
export function PeriodPicker({ period, onPick }: { period: Period; onPick: (k: PeriodKey) => void }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1 print:hidden">
      {PERIODS.filter((p) => p.key !== 'custom').map((p) => (
        <button key={p.key} type="button" onClick={() => onPick(p.key)}
          className={cn('rounded-md px-3 py-1 text-sm font-medium transition-colors',
            period.key === p.key ? 'bg-accent-primary text-white' : 'text-text-secondary hover:bg-muted')}>
          {p.label}
        </button>
      ))}
    </div>
  )
}

/** KPI kartı — büyük sayı + etiket + alt bilgi. */
export function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="bg-card flex flex-col gap-1 rounded-lg border border-border p-4 shadow-card">
      <div className="text-text-secondary text-xs font-medium">{label}</div>
      <div className={cn('text-2xl font-semibold tabular-nums', tone ?? 'text-foreground')}>{value}</div>
      {sub && <div className="text-text-muted text-xs">{sub}</div>}
    </div>
  )
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
