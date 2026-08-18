import { toCsv, downloadCsv } from './csv'
import { fetchReportPdf, type ReportPdfMeta } from './reportPdf'
import type { ReportPdfModel } from './reportChartSvg'

/** Rapor tablosunu CSV (Excel-uyumlu, BOM'lu, `;` ayraç) olarak indirir. */
export function exportReportCsv(fileName: string, headers: string[], rows: (string | number | null)[][]): void {
  downloadCsv(fileName.endsWith('.csv') ? fileName : `${fileName}.csv`, toCsv(headers, rows))
}

/** Belge motoruyla aynı görünümde rapor PDF'i üretir ve indirir (belge servisi).
 *  Servis yoksa/hata olursa throw eder — çağıran CSV'ye düşer. */
export async function downloadReportPdf(fileName: string, model: ReportPdfModel, meta: ReportPdfMeta, language = 'tr'): Promise<void> {
  const blob = await fetchReportPdf(model, meta, language)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
