// =====================================================================
// Rapor PDF'i — ekran modelini (ReportPdfModel) inline-stilli HTML gövdeye
// çevirir ve belge servisine (template: 'rapor') yollar. Grafikler
// reportChartSvg'nin AYNI fonksiyonlarından üretilir (ekranla birebir).
// Antet/font/sayfa çerçevesi studio.html'deki reportDoc() içinde durur.
// =====================================================================
import { env, PDF_UNAVAILABLE } from './env'
import {
  funnelSvg, hourHistogramSvg, donutSvg, escapeHtml, CHART_PALETTE,
  type ReportPdfModel, type ReportBlock, type ReportKpi,
} from './reportChartSvg'

const CARD = 'border:1px solid #ececf1;border-radius:10px;background:#fff'

function kpiHtml(k: ReportKpi): string {
  return `<div style="flex:1 1 150px;min-width:140px;${CARD};padding:12px 14px">
    <div style="font-size:11px;font-weight:600;color:#6b7280">${escapeHtml(k.label)}</div>
    <div style="font-size:22px;font-weight:700;color:#131318;margin-top:2px">${escapeHtml(k.value)}</div>
    ${k.sub ? `<div style="font-size:11px;color:#9096a1;margin-top:2px">${escapeHtml(k.sub)}</div>` : ''}
  </div>`
}

function section(title: string, inner: string): string {
  return `<section style="${CARD};padding:14px;margin-top:12px;break-inside:avoid">
    <h3 style="font-size:13px;font-weight:600;color:#131318;margin:0 0 10px">${escapeHtml(title)}</h3>${inner}</section>`
}

function legendHtml(items: { label: string; value?: string | number }[]): string {
  return `<ul style="list-style:none;margin:0;padding:0;font-size:12.5px">${items.map((it, i) =>
    `<li style="display:flex;align-items:center;gap:8px;margin:4px 0">
      <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${CHART_PALETTE[i % CHART_PALETTE.length]}"></span>
      <span style="color:#131318">${escapeHtml(it.label)}</span>
      ${it.value != null ? `<span style="color:#6b7280">${escapeHtml(it.value)}</span>` : ''}
    </li>`).join('')}</ul>`
}

function barsHtml(rows: { label: string; count: number }[], empty?: string): string {
  if (!rows.length) return `<p style="font-size:12.5px;color:#6b7280;margin:4px 0">${escapeHtml(empty ?? 'Veri yok.')}</p>`
  const max = Math.max(1, ...rows.map((r) => r.count))
  return rows.map((r) =>
    `<div style="display:flex;align-items:center;gap:8px;margin:5px 0">
      <div style="width:130px;font-size:12px;color:#3f4552">${escapeHtml(r.label)}</div>
      <div style="flex:1;height:14px;background:#efedff;border-radius:4px"><div style="width:${((r.count / max) * 100).toFixed(1)}%;height:14px;background:#6e55ff;border-radius:4px"></div></div>
      <div style="width:40px;text-align:right;font-size:12px;font-weight:600;color:#131318">${r.count}</div>
    </div>`).join('')
}

function tableHtml(headers: string[], rows: (string | number)[][]): string {
  const th = headers.map((h, i) => `<th style="padding:6px 8px;text-align:${i === 0 ? 'left' : 'right'};color:#555">${escapeHtml(h)}</th>`).join('')
  const body = rows.length
    ? rows.map((r) => `<tr>${r.map((c, i) => `<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:${i === 0 ? 'left' : 'right'}${i === 0 ? '' : ';font-variant-numeric:tabular-nums'}">${escapeHtml(c)}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${headers.length}" style="padding:14px;text-align:center;color:#999">Veri yok.</td></tr>`
  return `<table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr style="background:#f4f6fa;font-size:12px">${th}</tr></thead><tbody>${body}</tbody></table>`
}

function noticeHtml(variant: 'low' | 'none', title: string, text: string): string {
  const low = variant === 'low'
  const border = low ? '#f0b429' : '#e5e7eb'
  const bg = low ? '#fdf6e3' : '#f7f7f9'
  const icon = low ? '⚠' : 'ℹ'
  return `<div style="display:flex;gap:10px;border:1px solid ${border};background:${bg};border-radius:10px;padding:12px 14px;margin-top:12px;break-inside:avoid">
    <div style="font-size:14px;line-height:1.3">${icon}</div>
    <div><div style="font-size:12.5px;font-weight:600;color:#131318">${escapeHtml(title)}</div>
    <div style="font-size:12.5px;color:#3f4552;margin-top:2px">${escapeHtml(text)}</div></div>
  </div>`
}

function blockHtml(b: ReportBlock): string {
  switch (b.kind) {
    case 'sentence':
      return `<p style="font-size:13px;color:#3f4552;line-height:1.5;margin:12px 2px 0">${escapeHtml(b.text)}</p>`
    case 'funnel':
      return section(b.title, funnelSvg(b.steps) + (b.caption ? `<p style="font-size:11px;color:#6b7280;margin:8px 0 0">${escapeHtml(b.caption)}</p>` : ''))
    case 'hist':
      return section(b.title, hourHistogramSvg(b.data) + (b.caption ? `<p style="font-size:11px;color:#6b7280;margin:8px 0 0">${escapeHtml(b.caption)}</p>` : ''))
    case 'donut':
      return section(b.title, `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:24px">${donutSvg(b.segments, { centerLabel: b.centerLabel })}${legendHtml(b.legend)}</div>`)
    case 'bars':
      return section(b.title, barsHtml(b.rows, b.empty))
    case 'table':
      return section(b.title, tableHtml(b.headers, b.rows))
    case 'notice':
      return noticeHtml(b.variant, b.title, b.text)
  }
}

/** Model → inline-stilli gövde HTML (studio.html çerçevesine gömülür). */
export function buildReportBodyHtml(model: ReportPdfModel): string {
  const kpis = model.kpis.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:10px">${model.kpis.map(kpiHtml).join('')}</div>` : ''
  return kpis + model.blocks.map(blockHtml).join('')
}

export interface ReportPdfMeta { title: string; periodLabel: string; rangeLabel: string; generatedAt: string; footnote?: string }

/** Gövdeyi kurup belge servisine yollar; PDF blob döner. Servis yoksa/hatada throw. */
export async function fetchReportPdf(model: ReportPdfModel, meta: ReportPdfMeta, language = 'tr'): Promise<Blob> {
  if (!env.pdfServiceUrl) throw new Error(PDF_UNAVAILABLE)
  const bodyHtml = buildReportBodyHtml(model)
  const res = await fetch(env.pdfServiceUrl.replace(/\/$/, '') + '/render', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ template: 'rapor', language, data: { rapor: { ...meta, bodyHtml } } }),
  })
  if (!res.ok) throw new Error(`PDF servisi hatası (${res.status}). Servis çalışıyor mu? (${env.pdfServiceUrl})`)
  return res.blob()
}
