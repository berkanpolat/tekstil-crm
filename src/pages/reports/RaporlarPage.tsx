import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Download, FileText, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { usePeriod } from '@/hooks/useMetrics'
import { useHasPermission } from '@/hooks/useCatalog'
import { PeriodPicker, type CsvExport, type ReportPdfModel } from '@/components/reports/ReportKit'
import { exportReportCsv, downloadReportPdf } from '@/lib/exportReport'
import { hasPdfService } from '@/lib/env'
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
  const [pdf, setPdf] = useState<ReportPdfModel | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const stableSetCsv = useCallback((b: CsvExport | null) => setCsv(b), [])
  const stableSetPdf = useCallback((m: ReportPdfModel | null) => setPdf(m), [])

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

  const fallbackCsv = () => { if (csv) exportReportCsv(csv.filename, csv.headers, csv.rows) }
  async function onPdf() {
    if (!pdf) return
    if (!hasPdfService) { toast.info('Belge servisi bu ortamda kapalı; Excel (CSV) indiriliyor.'); fallbackCsv(); return }
    const fileName = `${active.key}-raporu-${period.key}`
    const meta = {
      title: `${active.label} Raporu`,
      periodLabel: period.label,
      rangeLabel: `${new Date(period.from).toLocaleDateString('tr-TR')} – ${new Date(period.to).toLocaleDateString('tr-TR')}`,
      generatedAt: new Date().toLocaleString('tr-TR'),
      footnote: 'Panelle aynı kaynaktan üretilmiştir; bilgilendirme amaçlıdır.',
    }
    setPdfBusy(true)
    try {
      await downloadReportPdf(fileName, pdf, meta)
    } catch {
      toast.error('PDF üretilemedi (belge servisi). Excel (CSV) indiriliyor.')
      fallbackCsv()
    } finally {
      setPdfBusy(false)
    }
  }

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
          <Button variant="outline" size="sm" disabled={!pdf || pdfBusy} onClick={onPdf}
            title={hasPdfService ? 'Belge motoruyla profesyonel PDF üret' : 'Belge servisi kapalı — Excel indirilir'}>
            <FileText className="size-4" /> {pdfBusy ? 'PDF…' : 'PDF'}
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

      <active.Component period={period} setCsv={stableSetCsv} setPdf={stableSetPdf} />
    </div>
  )
}
