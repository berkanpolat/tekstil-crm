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

/** Gün×saat ısı haritası — 7 satır (Pzt…Paz) × 24 sütun; opaklık = count/max; en yoğun hücre çerçeveli. */
export function dowHourHeatmapSvg(data: { dow: number; hour: number; count: number }[], opts: { width?: number; cellH?: number } = {}): string {
  const width = opts.width ?? 560, cellH = opts.cellH ?? 16
  const labelW = 34, padT = 14, gap = 2
  const cellW = (width - labelW - gap * 23) / 24
  const map = new Map(data.map((d) => [`${d.dow}-${d.hour}`, d.count]))
  const max = Math.max(1, ...data.map((d) => d.count))
  const peak = data.reduce<{ dow: number; hour: number; count: number } | null>((m, d) => (!m || d.count > m.count ? d : m), null)
  const GUN = ['', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
  const height = padT + 7 * (cellH + gap)
  let body = ''
  for (let h = 0; h < 24; h += 3) body += `<text x="${labelW + h * (cellW + gap) + cellW / 2}" y="${padT - 4}" font-size="9" text-anchor="middle" fill="${SVGC.muted}">${h}</text>`
  for (let d = 1; d <= 7; d++) {
    const y = padT + (d - 1) * (cellH + gap)
    body += `<text x="0" y="${y + cellH / 2}" font-size="10" dominant-baseline="central" fill="${SVGC.muted}">${GUN[d]}</text>`
    for (let h = 0; h < 24; h++) {
      const c = map.get(`${d}-${h}`) ?? 0
      const x = labelW + h * (cellW + gap)
      const op = c ? Math.max(0.18, c / max) : 1
      const isPeak = peak && c > 0 && peak.dow === d && peak.hour === h
      body += `<rect x="${x.toFixed(1)}" y="${y}" width="${cellW.toFixed(1)}" height="${cellH}" rx="2" fill="${c ? SVGC.accent : SVGC.track}" fill-opacity="${op.toFixed(2)}"${isPeak ? ` stroke="${SVGC.text}" stroke-width="1.5"` : ''}><title>${GUN[d]} ${h}:00 — ${c} talep</title></rect>`
    }
  }
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" preserveAspectRatio="xMinYMin meet" role="img" aria-label="Gün ve saate göre talep">${body}</svg>`
}

export interface TrendPointV2 { gun: string; count: number; onceki_count?: number }
/** Eğilim çizgisi — bu dönem (mor, dolgulu) + önceki dönem (gri kesikli). Sabit oran; PDF'te bozulmaz. */
export function trendSvg(points: TrendPointV2[], opts: { width?: number; height?: number } = {}): string {
  if (!points.length) return ''
  const width = opts.width ?? 560, height = opts.height ?? 140
  const padL = 4, padR = 4, padT = 8, padB = 18
  const W = width - padL - padR, H = height - padT - padB
  const max = Math.max(1, ...points.map((p) => Math.max(p.count, p.onceki_count ?? 0)))
  const step = points.length > 1 ? W / (points.length - 1) : 0
  const xy = (i: number, v: number) => [padL + i * step, padT + H - (v / max) * H] as const
  const path = (sel: (p: TrendPointV2) => number | undefined) => points
    .map((p, i) => { const v = sel(p); return v == null ? null : xy(i, v) })
    .map((pt, i) => (pt ? `${i === 0 ? 'M' : 'L'}${pt[0].toFixed(1)},${pt[1].toFixed(1)}` : '')).join(' ').trim()
  const cur = path((p) => p.count)
  const prev = points.some((p) => p.onceki_count != null) ? path((p) => p.onceki_count) : ''
  const area = `${cur} L${(padL + (points.length - 1) * step).toFixed(1)},${padT + H} L${padL},${padT + H} Z`
  const first = points[0]!.gun.slice(5), last = points[points.length - 1]!.gun.slice(5)
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" preserveAspectRatio="xMinYMin meet" role="img" aria-label="Talep eğilimi">` +
    `<path d="${area}" fill="${SVGC.accent}" fill-opacity="0.10"/>` +
    (prev ? `<path d="${prev}" fill="none" stroke="${SVGC.muted}" stroke-width="1.2" stroke-dasharray="4 3"/>` : '') +
    `<path d="${cur}" fill="none" stroke="${SVGC.accent}" stroke-width="2" stroke-linejoin="round"/>` +
    `<text x="${padL}" y="${height - 4}" font-size="9" fill="${SVGC.muted}">${escapeHtml(first)}</text>` +
    `<text x="${width - padR}" y="${height - 4}" font-size="9" text-anchor="end" fill="${SVGC.muted}">${escapeHtml(last)}</text>` +
    `</svg>`
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
  | { kind: 'heatmap'; title: string; data: { dow: number; hour: number; count: number }[]; caption?: string }
  | { kind: 'trend'; title: string; points: TrendPointV2[]; caption?: string }
export interface ReportPdfModel { kpis: ReportKpi[]; blocks: ReportBlock[] }
