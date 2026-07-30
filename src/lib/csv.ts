export interface ParsedCsv {
  headers: string[]
  rows: string[][]
}

/**
 * CSV ayrıştırıcı — tırnaklı alanlar, kaçış ("" ), alan içi yeni satır, BOM.
 * Ayraç otomatik (`;` Excel-TR ya da `,`). Harici bağımlılık yok.
 */
export function parseCsv(input: string): ParsedCsv {
  const text = input.replace(/^\uFEFF/, '')
  const nl = text.indexOf('\n')
  const firstLine = nl >= 0 ? text.slice(0, nl) : text
  const delim = firstLine.split(';').length > firstLine.split(',').length ? ';' : ','

  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delim) {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch !== '\r') {
      field += ch
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''))
  const headers = (nonEmpty.shift() ?? []).map((h) => h.trim())
  return { headers, rows: nonEmpty }
}

const esc = (v: unknown): string => {
  const s = v == null ? '' : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Satırları CSV metnine çevirir (`;` ayraç — Excel-TR uyumlu, BOM'lu). */
export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const lines = [headers.map(esc).join(';'), ...rows.map((r) => r.map(esc).join(';'))]
  return '\uFEFF' + lines.join('\r\n')
}

/** CSV içeriğini dosya olarak indirir (yeni pencere açmadan). */
export function downloadCsv(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
