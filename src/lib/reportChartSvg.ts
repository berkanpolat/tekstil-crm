// =====================================================================
// Rapor grafiklerinin ve PDF gövde modelinin TEK KAYNAĞI.
//
// Buradaki fonksiyonlar SAF: JSX / React / DOM yok, yalnız string döndürür.
//   • Ekran (ReportKit) bunları dangerouslySetInnerHTML ile basar.
//   • PDF (reportPdf.ts → belge servisi) aynı fonksiyonlarla gövdeyi kurup
//     studio.html çerçevesine gömer.
// Böylece "SVG iki yerde birebir aynı" derdi tanım gereği çözülür — çünkü
// tek bir uygulama var, iki tarafta da o çağrılıyor.
//
// Renkler açık hex (ikas paleti); studio.html PDF sayfasında Tailwind yok.
// =====================================================================

export const SVGC = {
  accent: '#6e55ff', stuck: '#f59e0b', track: '#efedff',
  text: '#131318', muted: '#6b7280', white: '#ffffff',
}
// Donut/legend ortak paleti — Donut ile SwatchLegend aynı sırayı kullanır.
export const CHART_PALETTE = ['#6e55ff', '#f59e0b', '#22c55e', '#94a3b8', '#5b43f0', '#ef4444']

/** HTML/SVG metin kaçışı — string gövdeler serviste ham gömülür. */
export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── SVG grafikler (saf string) ─────────────────────────────────────────
export interface FunnelStep { label: string; value: number; note?: string }
/** Yatay dönüşüm hunisi — ilerleyen (mor) vs bekleyen/düşen (amber). */
export function funnelSvg(steps: FunnelStep[], opts: { width?: number; rowHeight?: number } = {}): string {
  if (!steps.length) return ''
  const width = opts.width ?? 560, rowHeight = opts.rowHeight ?? 52
  const max = Math.max(1, ...steps.map((s) => s.value))
  const labelW = 128, barW = width - labelW, gap = 14
  const height = steps.length * (rowHeight + gap) - gap
  const body = steps.map((s, i) => {
    const next = steps[i + 1]
    const y = i * (rowHeight + gap), barY = y + 18, barH = rowHeight - 18
    const fillW = Math.max(2, (s.value / max) * barW)
    const advW = next ? Math.max(2, (Math.min(next.value, s.value) / max) * barW) : 0
    return (
      `<text x="0" y="${y + 12}" font-size="12" font-weight="600" fill="${SVGC.text}">${escapeHtml(s.label)}</text>` +
      (s.note ? `<text x="${width}" y="${y + 12}" font-size="11" text-anchor="end" fill="${SVGC.muted}">${escapeHtml(s.note)}</text>` : '') +
      `<rect x="${labelW}" y="${barY}" width="${barW}" height="${barH}" rx="6" fill="${SVGC.track}"/>` +
      `<rect x="${labelW}" y="${barY}" width="${fillW}" height="${barH}" rx="6" fill="${next ? SVGC.stuck : SVGC.accent}"/>` +
      (next ? `<rect x="${labelW}" y="${barY}" width="${advW}" height="${barH}" rx="6" fill="${SVGC.accent}"/>` : '') +
      `<text x="${labelW + 8}" y="${barY + barH / 2}" font-size="13" font-weight="700" fill="${SVGC.white}" dominant-baseline="central">${s.value}</text>`
    )
  }).join('')
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" preserveAspectRatio="xMinYMin meet" style="max-width:${width}px" role="img" aria-label="Dönüşüm hunisi">${body}</svg>`
}

/** Saate göre dağılım — 0–23 dikey çubuklar (eksik saatler 0 çizilir). */
export function hourHistogramSvg(data: { hour: number; count: number }[], opts: { width?: number; height?: number } = {}): string {
  const width = opts.width ?? 560, height = opts.height ?? 140
  const map = new Map(data.map((d) => [d.hour, d.count]))
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: map.get(h) ?? 0 }))
  const max = Math.max(1, ...hours.map((h) => h.count))
  const padT = 8, padB = 18, chartH = height - padT - padB, gap = 3
  const bw = (width - gap * 23) / 24
  const body = hours.map((h, i) => {
    const bh = (h.count / max) * chartH
    const x = i * (bw + gap)
    return (
      `<rect x="${x}" y="${padT + (chartH - bh)}" width="${bw}" height="${Math.max(0.5, bh)}" rx="2" fill="${h.count ? SVGC.accent : SVGC.track}"/>` +
      (h.hour % 3 === 0 ? `<text x="${x + bw / 2}" y="${height - 4}" font-size="9" text-anchor="middle" fill="${SVGC.muted}">${h.hour}</text>` : '')
    )
  }).join('')
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" preserveAspectRatio="xMinYMin meet" role="img" aria-label="Saate göre dağılım">${body}</svg>`
}

export interface DonutSegment { label: string; value: number; color?: string }
/** Halka grafik — merkezde toplam. Legend ayrı (SwatchLegend / legend HTML). */
export function donutSvg(segments: DonutSegment[], opts: { size?: number; thickness?: number; centerLabel?: string } = {}): string {
  const size = opts.size ?? 150, thickness = opts.thickness ?? 24
  const total = segments.reduce((s, x) => s + x.value, 0)
  const r = (size - thickness) / 2, c = size / 2, circ = 2 * Math.PI * r
  let offset = 0
  const arcs = total > 0 ? segments.map((s, i) => {
    const len = (s.value / total) * circ
    const el = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${s.color ?? CHART_PALETTE[i % CHART_PALETTE.length]}" stroke-width="${thickness}" stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${c} ${c})"/>`
    offset += len
    return el
  }).join('') : ''
  return (
    `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Dağılım">` +
    `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${SVGC.track}" stroke-width="${thickness}"/>` +
    arcs +
    `<text x="${c}" y="${opts.centerLabel ? c - 2 : c}" text-anchor="middle" dominant-baseline="central" font-size="22" font-weight="700" fill="${SVGC.text}">${total}</text>` +
    (opts.centerLabel ? `<text x="${c}" y="${c + 16}" text-anchor="middle" font-size="11" fill="${SVGC.muted}">${escapeHtml(opts.centerLabel)}</text>` : '') +
    `</svg>`
  )
}

// ── PDF gövde modeli (ekran raporu → yazdırılabilir yapı) ───────────────
// Her rapor bu modeli setPdf ile bildirir; reportPdf.ts serileştirir.
export interface ReportKpi { label: string; value: string; sub?: string }
export type ReportBlock =
  | { kind: 'sentence'; text: string }
  | { kind: 'funnel'; title: string; steps: FunnelStep[]; caption?: string }
  | { kind: 'donut'; title: string; segments: DonutSegment[]; legend: { label: string; value?: string | number }[]; centerLabel?: string }
  | { kind: 'hist'; title: string; data: { hour: number; count: number }[]; caption?: string }
  | { kind: 'bars'; title: string; rows: { label: string; count: number }[]; empty?: string }
  | { kind: 'table'; title: string; headers: string[]; rows: (string | number)[][] }
  | { kind: 'notice'; variant: 'low' | 'none'; title: string; text: string }
export interface ReportPdfModel { kpis: ReportKpi[]; blocks: ReportBlock[] }
