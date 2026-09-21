import { useEffect } from 'react'
import {
  Kpi, ReportSection, ReportLoading, BarList, HourHistogram, Funnel, DataTable, type ReportProps, type FunnelStep,
} from '@/components/reports/ReportKit'
import { useRequestsMetric, useGenelMetric, type Labeled } from '@/hooks/useMetrics'

// ── GENEL RAPOR — tek sayfa (istek: Tuna, 21 Eyl 2026) ─────────────────────
// Talep adedi · teklif verilen/verilmeyen · 24 saat sözü · il · pazarlama kanalı ·
// katalog/manuel · gün-saat sıklığı · red sebepleri (+il) · kabul illeri ·
// teklif→numune, numune→sipariş · huni · numune/sipariş sayısı.
// Veri: metric_requests (talep tarafı) + metric_genel (durum/red/kabul tarafı).
// "Yapılamaz" işareti henüz yok (madde 9 — Berkan'ın dalı bitince).

const GUNLER = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
const rows = (arr?: Labeled[]) => (arr ?? []).map((x) => ({ label: x.label, count: x.count }))
const pct = (v?: number | null) => (v == null ? '—' : `%${v.toFixed(1)}`)
const oran = (a: number, b: number) => (b > 0 ? `%${((100 * a) / b).toFixed(0)}` : '—')

export function GenelRaporu({ period, setCsv, setPdf }: ReportProps) {
  const req = useRequestsMetric(period)
  const gen = useGenelMetric(period)
  const r = req.data
  const g = gen.data
  const huni: FunnelStep[] = (g?.huni ?? []).map((h) => ({ label: h.label, value: h.value }))
  const dow = (r?.by_dow ?? []).map((d) => ({ label: GUNLER[d.dow] ?? String(d.dow), count: d.count }))
  const enYogunSaat = (r?.by_hour ?? []).reduce<{ hour: number; count: number } | null>((m, x) => (!m || x.count > m.count ? x : m), null)
  const enYogunGun = dow.reduce<{ label: string; count: number } | null>((m, x) => (!m || x.count > m.count ? x : m), null)

  useEffect(() => {
    if (!r || !g) { setCsv(null); setPdf(null); return }
    setCsv({
      filename: `genel-rapor-${period.key}`,
      headers: ['Kırılım', 'Değer', 'Sayı'],
      rows: [
        ['Özet', 'Talep', g.talep], ['Özet', 'Teklif verilen', g.teklif_verilen], ['Özet', 'Teklif verilmeyen', g.teklif_verilmeyen],
        ['Özet', 'Reddedilen', g.reddedilen], ['Özet', 'Kabul', g.kabul], ['Özet', 'Numune', g.numune_sayisi], ['Özet', 'Sipariş', g.siparis_sayisi],
        ['Özet', '24 saat sözü %', r.sla_rate ?? ''],
        ...(r.by_marketing ?? []).map((x) => ['Pazarlama kanalı', x.label, x.count] as (string | number)[]),
        ...(r.by_province ?? []).map((x) => ['İl', x.label, x.count] as (string | number)[]),
        ...(r.by_product_source ?? []).map((x) => ['Ürün kaynağı', x.label, x.count] as (string | number)[]),
        ...(g.red_sebepleri ?? []).map((x) => ['Red sebebi', x.label, x.count] as (string | number)[]),
        ...(g.red_sebebi_il ?? []).map((x) => ['Red sebebi × il', `${x.sebep} — ${x.il}`, x.count] as (string | number)[]),
        ...(g.kabul_il ?? []).map((x) => ['Kabul ili', x.label, x.count] as (string | number)[]),
      ],
    })
    setPdf({
      kpis: [
        { label: 'Talep', value: String(g.talep), sub: `önceki dönem: ${r.prev_total ?? 0}` },
        { label: 'Teklif verilen', value: String(g.teklif_verilen), sub: `${g.teklif_verilmeyen} verilmedi · ${g.reddedilen} reddedildi` },
        { label: '24 saat sözü', value: pct(r.sla_rate), sub: `${r.sla_met_count ?? 0} tuttu · ${r.sla_missed_count ?? 0} kaçtı` },
        { label: 'Numune / Sipariş', value: `${g.numune_sayisi} / ${g.siparis_sayisi}`, sub: `teklif→numune ${pct(g.teklif_numune_orani)} · numune→sipariş ${pct(g.numune_siparis_orani)}` },
      ],
      blocks: [
        { kind: 'funnel', title: 'Dönüşüm hunisi', steps: huni, caption: 'Talep → teklif verildi → kabul/numune → sipariş (bu dönemde açılan talepler).' },
        { kind: 'bars', title: 'Pazarlama kanalına göre', rows: rows(r.by_marketing) },
        { kind: 'bars', title: 'İle göre', rows: rows(r.by_province) },
        { kind: 'bars', title: 'Ürün kaynağına göre (katalog / manuel)', rows: rows(r.by_product_source) },
        { kind: 'hist', title: 'Saate göre', data: r.by_hour ?? [], caption: 'Taleplerin günün hangi saatlerinde yoğunlaştığı (yerel saat).' },
        { kind: 'bars', title: 'Güne göre', rows: dow },
        { kind: 'bars', title: 'Red sebepleri', rows: rows(g.red_sebepleri) },
        { kind: 'bars', title: 'Reddedilen taleplerin ili', rows: rows(g.red_il) },
        { kind: 'bars', title: 'Kabul edilen taleplerin ili', rows: rows(g.kabul_il) },
      ],
    })
    return () => { setCsv(null); setPdf(null) }
  }, [r, g, period.key, setCsv, setPdf]) // eslint-disable-line react-hooks/exhaustive-deps

  if (req.isLoading || gen.isLoading) return <ReportLoading />
  if (!r || !g) return <ReportLoading />
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Talep" value={String(g.talep)} sub={`önceki dönem: ${r.prev_total ?? 0}`} />
        <Kpi label="Teklif verilen" value={String(g.teklif_verilen)} sub={`${g.teklif_verilmeyen} verilmedi · ${g.reddedilen} reddedildi`} />
        <Kpi label="24 saat sözü" value={pct(r.sla_rate)}
          tone={(r.sla_rate ?? 0) >= 80 ? 'text-success-foreground' : (r.sla_rate ?? 0) >= 50 ? 'text-warning-foreground' : 'text-danger-foreground'}
          sub={`${r.sla_met_count ?? 0} tuttu · ${r.sla_missed_count ?? 0} kaçtı · ${r.sla_pending_count ?? 0} sürüyor`} />
        <Kpi label="Numune / Sipariş" value={`${g.numune_sayisi} / ${g.siparis_sayisi}`}
          sub={`teklif→numune ${pct(g.teklif_numune_orani)} · numune→sipariş ${pct(g.numune_siparis_orani)}`} />
      </div>
      {g.talep > 0 && (
        <p className="text-text-secondary text-sm leading-snug">
          <strong className="text-foreground">{g.talep} talebin</strong> {g.teklif_verilen}'ine teklif verildi ({oran(g.teklif_verilen, g.talep)}),{' '}
          {g.reddedilen}'i reddedildi, {g.kabul}'ü numune ya da sonrasına geçti.
          {enYogunGun && enYogunSaat ? <> En yoğun gün <strong className="text-foreground">{enYogunGun.label}</strong>, en yoğun saat <strong className="text-foreground">{enYogunSaat.hour}:00</strong>.</> : null}
        </p>
      )}
      <ReportSection title="Dönüşüm hunisi"><Funnel steps={huni} /></ReportSection>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReportSection title="Pazarlama kanalına göre">
          <BarList rows={rows(r.by_marketing)} empty="Kanal verisi yok." />
          <p className="text-text-muted text-xs">Siteden gelenlerde otomatik (reklam tıklaması, UTM, yönlendiren); elle açılan taleplerde formdan seçilir.</p>
        </ReportSection>
        <ReportSection title="İle göre"><BarList rows={rows(r.by_province)} empty="İl verisi yok." /></ReportSection>
        <ReportSection title="Ürün kaynağına göre"><BarList rows={rows(r.by_product_source)} /></ReportSection>
        <ReportSection title="Güne göre"><BarList rows={dow} /></ReportSection>
      </div>
      <ReportSection title="Saate göre talep dağılımı">
        <HourHistogram data={r.by_hour ?? []} />
        <p className="text-text-muted text-xs">0–23, yerel saat.</p>
      </ReportSection>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ReportSection title="Red sebepleri"><BarList rows={rows(g.red_sebepleri)} barClass="bg-danger-foreground" empty="Bu dönemde red yok." /></ReportSection>
        <ReportSection title="Reddedilenlerin ili"><BarList rows={rows(g.red_il)} barClass="bg-danger-foreground" empty="Bu dönemde red yok." /></ReportSection>
        <ReportSection title="Kabul edilenlerin ili"><BarList rows={rows(g.kabul_il)} barClass="bg-success-foreground" empty="Bu dönemde kabul yok." /></ReportSection>
      </div>
      <ReportSection title="Red sebebi × il">
        <DataTable cols={[{ key: 'sebep', label: 'Sebep' }, { key: 'il', label: 'İl' }, { key: 'count', label: 'Talep', align: 'right' }]}
          rows={(g.red_sebebi_il ?? []) as unknown as Record<string, unknown>[]} empty="Bu dönemde red yok." />
      </ReportSection>
    </div>
  )
}
