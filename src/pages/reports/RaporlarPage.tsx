import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Download, Printer, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { usePeriod } from '@/hooks/useMetrics'
import { useHasPermission } from '@/hooks/useCatalog'
import { PeriodPicker, type CsvExport } from '@/components/reports/ReportKit'
import { exportReportCsv, printReport } from '@/lib/exportReport'
import { REPORTS } from './reportRegistry'

/** Raporlar (P7.4-P7.10) — metrics.* tek kaynağından; dönem + kırılım filtreleri
 *  URL'de kalıcı; Excel (CSV) + PDF (yazdır) dışa aktarım. reports.view korumalı. */
export function RaporlarPage() {
  const canView = useHasPermission('reports.view')
  const canExport = useHasPermission('reports.export')
  const canFinance = useHasPermission('finance.view')
  const { period, setPeriod } = usePeriod()
  const [sp, setSp] = useSearchParams()
  const [csv, setCsv] = useState<CsvExport | null>(null)
  const stableSetCsv = useCallback((b: CsvExport | null) => setCsv(b), [])

  if (canView.isLoading) return <div className="space-y-4"><PageHeader title="Raporlar" /></div>
  if (!canView.data) {
    return (
      <div className="space-y-4">
        <PageHeader title="Raporlar" />
        <div className="bg-card text-text-secondary flex items-center gap-3 rounded-lg border border-border p-6">
          <Lock className="size-5" /> Bu bölümü görüntüleme yetkiniz yok.
        </div>
      </div>
    )
  }

  const available = REPORTS.filter((r) => r.permission !== 'finance.view' || canFinance.data)
  const urlKey = sp.get('rapor')
  const activeKey = urlKey && available.some((r) => r.key === urlKey) ? urlKey : (available[0]?.key ?? 'talep')
  const active = available.find((r) => r.key === activeKey) ?? available[0]!
  function pickReport(key: string) { const p = new URLSearchParams(sp); p.set('rapor', key); setSp(p, { replace: true }) }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <PageHeader title="Raporlar" description="Panelle aynı kaynaktan; dönem seçilebilir, Excel/PDF dışa aktarılabilir." />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={!csv || !canExport.data}
            title={!canExport.data ? 'Dışa aktarma yetkiniz yok' : 'Excel (CSV) indir'}
            onClick={() => csv && exportReportCsv(csv.filename, csv.headers, csv.rows)}>
            <Download className="size-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => printReport()} title="PDF olarak yazdır">
            <Printer className="size-4" /> PDF
          </Button>
        </div>
      </div>

      {/* Rapor sekmeleri */}
      <div className="flex flex-wrap gap-1 border-b border-border print:hidden">
        {available.map((r) => (
          <button key={r.key} type="button" onClick={() => pickReport(r.key)}
            className={cn('flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              r.key === activeKey ? 'border-accent-primary text-accent-primary' : 'text-text-secondary hover:text-foreground border-transparent')}>
            <r.icon className="size-4" /> {r.label}
          </button>
        ))}
      </div>

      {/* Filtre çubuğu */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <PeriodPicker period={period} onPick={(k, range) => setPeriod(k, range)} />
      </div>

      {/* Yazdırma başlığı (yalnız print) */}
      <div className="hidden print:block">
        <h1 className="text-xl font-bold text-black">{active.label} Raporu</h1>
        <p className="text-sm text-neutral-600">{period.label} · {new Date(period.from).toLocaleDateString('tr-TR')} – {new Date(period.to).toLocaleDateString('tr-TR')}</p>
      </div>

      <active.Component period={period} setCsv={stableSetCsv} />
    </div>
  )
}
