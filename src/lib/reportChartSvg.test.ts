import { describe, it, expect } from 'vitest'
import { funnelSvg, donutSvg, hourHistogramSvg, escapeHtml, SVGC } from './reportChartSvg'
import { buildReportBodyHtml } from './reportPdf'
import type { ReportPdfModel } from './reportChartSvg'

const count = (s: string, needle: string) => s.split(needle).length - 1

describe('escapeHtml', () => {
  it('HTML özel karakterlerini kaçar', () => {
    expect(escapeHtml('<b>&"x')).toBe('&lt;b&gt;&amp;&quot;x')
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(42)).toBe('42')
  })
})

describe('funnelSvg', () => {
  it('boş adımda boş string döner', () => {
    expect(funnelSvg([])).toBe('')
  })
  it('ilerleyen/track/fill dikdörtgenlerini ve değerleri çizer', () => {
    const svg = funnelSvg([
      { label: 'Talep', value: 251, note: '199 ilerledi · 52 bekliyor' },
      { label: 'Teklif', value: 199 },
    ])
    expect(svg.startsWith('<svg')).toBe(true)
    // adım0: track+fill+advanced = 3, adım1 (son): track+fill = 2 → 5
    expect(count(svg, '<rect')).toBe(5)
    expect(svg).toContain('>251<')
    expect(svg).toContain('>199<')
    expect(svg).toContain(SVGC.accent) // mor (ilerleyen)
    expect(svg).toContain(SVGC.stuck)  // amber (bekleyen/düşen)
    expect(svg).toContain('199 ilerledi · 52 bekliyor') // not
  })
  it('metin içeriğini kaçar', () => {
    expect(funnelSvg([{ label: '<x>', value: 1 }])).toContain('&lt;x&gt;')
  })
})

describe('donutSvg', () => {
  it('merkezde toplamı ve segment yaylarını çizer', () => {
    const svg = donutSvg([{ label: 'Kabul', value: 20 }, { label: 'Red', value: 155 }, { label: 'Bekleyen', value: 39 }], { centerLabel: 'teklif' })
    expect(svg).toContain('>214<') // toplam
    expect(svg).toContain('teklif')
    // 1 track circle + 3 segment = 4
    expect(count(svg, '<circle')).toBe(4)
  })
  it('toplam 0 ise yay çizmez (yalnız track)', () => {
    const svg = donutSvg([{ label: 'a', value: 0 }, { label: 'b', value: 0 }])
    expect(count(svg, '<circle')).toBe(1)
    expect(svg).toContain('>0<')
  })
})

describe('hourHistogramSvg', () => {
  it('24 çubuk ve 3 saatte bir etiket çizer', () => {
    const svg = hourHistogramSvg([{ hour: 9, count: 5 }, { hour: 14, count: 3 }])
    expect(count(svg, '<rect')).toBe(24)
    // 0,3,6,9,12,15,18,21 → 8 etiket
    expect(count(svg, '<text')).toBe(8)
  })
})

describe('buildReportBodyHtml', () => {
  const model: ReportPdfModel = {
    kpis: [{ label: 'Toplam talep', value: '251', sub: 'önceki: 200' }],
    blocks: [
      { kind: 'sentence', text: '251 talebin 199\'u teklife geçti' },
      { kind: 'funnel', title: 'Huni', steps: [{ label: 'Talep', value: 251 }, { label: 'Teklif', value: 199 }], caption: 'not' },
      { kind: 'donut', title: 'Dağılım', centerLabel: 'teklif', segments: [{ label: 'Kabul', value: 20 }], legend: [{ label: 'Kabul', value: 20 }] },
      { kind: 'hist', title: 'Saat', data: [{ hour: 9, count: 5 }] },
      { kind: 'bars', title: 'Kanal', rows: [{ label: 'WhatsApp', count: 30 }, { label: 'E-posta', count: 10 }] },
      { kind: 'table', title: 'Aylık', headers: ['Ay', 'USD'], rows: [['2026-08', '$1.000']] },
      { kind: 'notice', variant: 'none', title: 'İlçe yok', text: 'toplanmıyor' },
      { kind: 'notice', variant: 'low', title: 'Sığ veri', text: '~20 gerekir' },
    ],
  }
  const html = buildReportBodyHtml(model)

  it('KPI kartını içerir', () => {
    expect(html).toContain('Toplam talep')
    expect(html).toContain('251')
    expect(html).toContain('önceki: 200')
  })
  it('cümleyi kaçarak basar', () => {
    expect(html).toContain('251 talebin 199\'u teklife geçti')
  })
  it('grafik blokları SVG üretir', () => {
    expect(count(html, '<svg')).toBe(3) // funnel + donut + hist
  })
  it('bar listesinde oransal genişlik hesaplar', () => {
    expect(html).toContain('WhatsApp')
    expect(html).toContain('width:100.0%') // en büyük bar
    expect(html).toContain('width:33.3%')  // 10/30
  })
  it('tabloyu başlık+satırla basar', () => {
    expect(html).toContain('Aylık')
    expect(html).toContain('2026-08')
    expect(html).toContain('$1.000')
  })
  it('düşük/none uyarılarını ayırır', () => {
    expect(html).toContain('İlçe yok')
    expect(html).toContain('Sığ veri')
    expect(html).toContain('#fdf6e3') // low amber arka plan
  })
})
