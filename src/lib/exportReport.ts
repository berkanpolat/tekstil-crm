import { toCsv, downloadCsv } from './csv'

/** Rapor tablosunu CSV (Excel-uyumlu, BOM'lu, `;` ayraç) olarak indirir. */
export function exportReportCsv(fileName: string, headers: string[], rows: (string | number | null)[][]): void {
  downloadCsv(fileName.endsWith('.csv') ? fileName : `${fileName}.csv`, toCsv(headers, rows))
}

/** Tarayıcı yazdırma (→ "PDF olarak kaydet"). Kabuk @media print ile gizlenir. */
export function printReport(): void {
  window.print()
}
