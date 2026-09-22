import { useEffect, useMemo, useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAiAssist } from '@/hooks/useAi'
import { useHasPermission } from '@/hooks/useCatalog'
import { buildRaporYorumuPayload } from '@/lib/aiPayloads'
import { useSearchParams } from 'react-router-dom'
import {
  Kpi, ReportSection, ReportLoading, BarList, Heatmap, TrendChart, Funnel, DataTable, FilterSelect,
  type ReportProps, type FunnelStep,
} from '@/components/reports/ReportKit'
import { ChannelFunnelTable } from '@/components/reports/ChannelFunnelTable'
import { useRequestsMetric, useGenelMetric, useFilterOptions, type Labeled } from '@/hooks/useMetrics'
import { deltaMetni, oranMetni, oneCikanKanallar, huniCsvSatirlari, HUNI_CSV_BASLIK } from '@/lib/reportFunnel'

// ── GENEL RAPOR v2 — pazarlama gözüyle tek sayfa (plan: 22 Eyl 2026) ─────
// 1 filtre (pazarlama kanalı, URL `mk`) · 2 KPI şeridi (önceki dönemle) · 3 özet cümle
// 4 Kanal × Huni · 5 eğilim (önceki dönem üstüne) · 6 ısı haritası | huni
// 7 Kampanya × Huni (Faz 2) · 8 İl × Huni (Faz 2) · 9 kayıp analizi
// Veri: metric_requests (talep tarafı, kanal filtreli) + metric_genel v2.

const rows = (arr?: Labeled[]) => (arr ?? []).map((x) => ({ label: x.label, count: x.count }))
const pct = (v?: number | null) => (v == null ? '—' : `%${v.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`)
const sa = (v?: number | null) => (v == null ? '—' : `${v.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sa`)

export function GenelRaporu({ period, setCsv, setPdf }: ReportProps) {
  const [sp, setSp] = useSearchParams()
  const mk = sp.get('mk') ? Number(sp.get('mk')) : null
  const opts = useFilterOptions()
  const req = useRequestsMetric(period, { marketing: mk })
  const gen = useGenelMetric(period, mk)
  const r = req.data
  const g = gen.data
  const minBase = g?.min_rate_base ?? 5
  const huni: FunnelStep[] = useMemo(() => (g?.huni ?? []).map((h) => ({ label: h.label, value: h.value })), [g])
  const one = useMemo(() => oneCikanKanallar(g?.kanal_huni ?? [], minBase), [g, minBase])
  const setMk = (v: string) => { const p = new URLSearchParams(sp); if (v) p.set('mk', v); else p.delete('mk'); setSp(p, { replace: true }) }
  const kanalAdi = mk ? opts.data?.marketing.find((m) => m.value === mk)?.label : null
  const finans = useHasPermission('reports.finance').data ?? false
  const ai = useAiAssist()
  // Yorum dönem+kanal anahtarına bağlı: dönem değişince kendiliğinden düşer (effect'te setState yok)
  const yorumKey = `${period.key}|${period.from}|${mk ?? ''}`
  const [yorumRaw, setYorumRaw] = useState<{ k: string; t: string } | null>(null)
  const yorum = yorumRaw && yorumRaw.k === yorumKey ? yorumRaw.t : null
  const setYorum = (t: string | null) => setYorumRaw(t == null ? null : { k: yorumKey, t })
  async function yorumla() {
    if (!g || !r) return
    const res = await ai.mutateAsync(buildRaporYorumuPayload({
      donem: period.label, talep: g.talep, onceki_talep: g.onceki.talep, teklif_verilen: g.teklif_verilen, reddedilen: g.reddedilen, kabul: g.kabul,
      numune: g.numune_sayisi, siparis: g.siparis_sayisi, ilk_yanit_saat: g.ilk_yanit_saat, sla_orani: r.sla_rate ?? null,
      kanallar: g.kanal_huni.map((k) => ({ label: k.label, talep: k.talep, teklif: k.teklif, siparis: k.siparis, reddedilen: k.reddedilen })),
      red_sebepleri: g.red_sebepleri,
    }))
    setYorum(res.result ?? res.error ?? 'Yorum üretilemedi.')
  }

  useEffect(() => {
    if (!r || !g) { setCsv(null); setPdf(null); return }
    const csvRows: (string | number)[][] = [
      ['Özet', 'Talep', g.talep, g.onceki.talep, g.teklif_verilen, g.talep ? Math.round((1000 * g.teklif_verilen) / g.talep) / 10 : '', g.numune, g.siparis, g.talep ? Math.round((1000 * g.siparis) / g.talep) / 10 : '', g.reddedilen, g.talep ? Math.round((1000 * g.reddedilen) / g.talep) / 10 : '', g.ilk_yanit_saat ?? '', r.sla_rate ?? ''],
      ...huniCsvSatirlari('Kanal', g.kanal_huni),
      ...huniCsvSatirlari('Kampanya', g.kampanya_huni),
      ...huniCsvSatirlari('İl', g.il_huni),
      ...(r.by_product_source ?? []).map((x) => ['Ürün kaynağı', x.label, x.count] as (string | number)[]),
      ...(g.red_sebepleri ?? []).map((x) => ['Red sebebi', x.label, x.count] as (string | number)[]),
      ...(g.red_sebebi_kanal ?? []).map((x) => ['Red sebebi × kanal', `${x.sebep} — ${x.kanal}`, x.count] as (string | number)[]),
      ...(g.red_sebebi_il ?? []).map((x) => ['Red sebebi × il', `${x.sebep} — ${x.il}`, x.count] as (string | number)[]),
    ]
    setCsv({ filename: `genel-rapor-${period.key}${mk ? '-kanal' + mk : ''}`, headers: HUNI_CSV_BASLIK, rows: csvRows })
    const tablo = (rs: typeof g.kanal_huni) => rs.map((x) => [x.label, x.talep, `${x.teklif} (${oranMetni(x.teklif, x.talep, minBase)})`, `${x.numune} (${oranMetni(x.numune, x.teklif, minBase)})`, `${x.siparis} (${oranMetni(x.siparis, x.talep, minBase)})`, `${x.reddedilen} (${oranMetni(x.reddedilen, x.talep, minBase)})`, sa(x.ilk_yanit_saat), oranMetni(x.sla_met, x.sla_met + x.sla_missed, minBase)])
    const tabloBaslik = ['Kırılım', 'Talep', 'Teklif', 'Numune', 'Sipariş', 'Red', 'İlk yanıt', '24s']
    setPdf({
      kpis: [
        { label: 'Talep', value: String(g.talep), sub: deltaMetni(g.talep, g.onceki.talep, minBase) },
        { label: 'Teklif verilen', value: `${g.teklif_verilen} · ${oranMetni(g.teklif_verilen, g.talep, minBase)}`, sub: `${g.teklif_verilmeyen} verilmedi` },
        { label: 'Sipariş', value: `${g.siparis} · ${oranMetni(g.siparis, g.talep, minBase)}`, sub: `talep→sipariş · önceki dönem ${pct(g.onceki.siparis_orani)}` },
        { label: 'Red', value: `${g.reddedilen} · ${oranMetni(g.reddedilen, g.talep, minBase)}`, sub: 'reddedilen / iptal' },
        { label: 'İlk yanıt', value: sa(g.ilk_yanit_saat), sub: `24 saat sözü ${pct(r.sla_rate)}` },
        { label: 'Numune / Sipariş', value: `${g.numune_sayisi} / ${g.siparis_sayisi}`, sub: `teklif→numune ${pct(g.teklif_numune_orani)} · numune→sipariş ${pct(g.numune_siparis_orani)}` },
      ],
      blocks: [
        ...(yorum ? [{ kind: 'sentence' as const, text: `YZ yorumu: ${yorum}` }] : []),
        ...(one.enIyi ? [{ kind: 'sentence' as const, text: `En verimli kanal ${one.enIyi.label} (talep→sipariş ${pct(one.enIyi.siparis_orani)}, ${one.enIyi.talep} talep)${one.enKotu ? `; en yüksek red oranı ${one.enKotu.label} (${pct(one.enKotu.red_orani)})` : ''}.` }] : []),
        { kind: 'table', title: 'Kanal × Huni', headers: tabloBaslik, rows: tablo(g.kanal_huni) },
        { kind: 'trend', title: 'Talep eğilimi', points: g.egilim, caption: `${g.egilim_birim === 'hafta' ? 'Haftalık' : 'Günlük'}; kesikli çizgi önceki eşit uzunluktaki dönem.` },
        { kind: 'heatmap', title: 'Gün × saat', data: r.by_dow_hour ?? [], caption: 'Koyu hücre = çok talep; çerçeveli hücre en yoğun saat (yerel saat).' },
        { kind: 'funnel', title: 'Dönüşüm hunisi', steps: huni, caption: 'Talep → teklif verildi → kabul/numune → sipariş (bu dönemde açılan talepler).' },
        { kind: 'table', title: 'Kampanya × Huni', headers: tabloBaslik, rows: tablo(g.kampanya_huni.slice(0, 15)) },
        { kind: 'table', title: 'İl × Huni', headers: tabloBaslik, rows: tablo(g.il_huni.slice(0, 20)) },
        { kind: 'bars', title: 'Ürün kaynağına göre (katalog / manuel)', rows: rows(r.by_product_source) },
        { kind: 'bars', title: 'Red sebepleri', rows: rows(g.red_sebepleri) },
        { kind: 'table', title: 'Red sebebi × kanal', headers: ['Sebep', 'Kanal', 'Talep'], rows: g.red_sebebi_kanal.map((x) => [x.sebep, x.kanal, x.count]) },
      ],
    })
    return () => { setCsv(null); setPdf(null) }
  }, [r, g, period.key, mk, minBase, one, huni, yorum, setCsv, setPdf])

  if (req.isLoading || gen.isLoading) return <ReportLoading />
  if (!r || !g) return <ReportLoading />
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <FilterSelect label="Pazarlama kanalı" value={sp.get('mk') ?? ''} onChange={setMk} options={opts.data?.marketing ?? []} />
        {kanalAdi && <span className="text-text-secondary text-xs">Yalnız <strong className="text-foreground">{kanalAdi}</strong> kanalı gösteriliyor — kampanya ve il tabloları bu kanalın içidir.</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Talep" value={String(g.talep)} sub={deltaMetni(g.talep, g.onceki.talep, minBase)} />
        <Kpi label="Teklif verilen" value={`${g.teklif_verilen} · ${oranMetni(g.teklif_verilen, g.talep, minBase)}`} sub={`${g.teklif_verilmeyen} verilmedi`} />
        <Kpi label="Sipariş" value={`${g.siparis} · ${oranMetni(g.siparis, g.talep, minBase)}`} sub={`talep→sipariş · önceki ${pct(g.onceki.siparis_orani)}`} tone="text-success-foreground" />
        <Kpi label="Red" value={`${g.reddedilen} · ${oranMetni(g.reddedilen, g.talep, minBase)}`} sub="reddedilen / iptal" tone={(g.talep && g.reddedilen / g.talep > 0.4) ? 'text-danger-foreground' : undefined} />
        <Kpi label="İlk yanıt" value={sa(g.ilk_yanit_saat)} sub={`24 saat sözü ${pct(r.sla_rate)}${r.sla_unknown_count ? ` · ${r.sla_unknown_count} bilinmiyor` : ''}`} />
        <Kpi label="Numune / Sipariş" value={`${g.numune_sayisi} / ${g.siparis_sayisi}`} sub={`teklif→numune ${pct(g.teklif_numune_orani)} · numune→sipariş ${pct(g.numune_siparis_orani)}`} />
      </div>
      {finans && g.toplam_harcama != null && (
        <div className="grid grid-cols-3 gap-3">
          <Kpi label="Reklam harcaması" value={`${g.toplam_harcama.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ${g.harcama_para_birimi}`} sub="dönemle kesişen aylar gün oranında" />
          <Kpi label="Talep başı maliyet (CPL)" value={g.cpl == null ? '—' : `${g.cpl.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ${g.harcama_para_birimi}`} sub="harcama ÷ talep" />
          <Kpi label="Sipariş başı maliyet (CPA)" value={g.cpa == null ? '—' : `${g.cpa.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ${g.harcama_para_birimi}`} sub="harcama ÷ sipariş" />
        </div>
      )}
      <div className="flex items-center gap-2 print:hidden">
        <Button size="sm" variant="outline" onClick={() => void yorumla()} disabled={ai.isPending}>{ai.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} YZ yorumu</Button>
        <span className="text-text-muted text-xs">Yalnız sayısal özet gönderilir; müşteri adı ya da tutar gitmez.</span>
      </div>
      {yorum && <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm leading-snug text-foreground">{yorum}</p>}
      {g.talep > 0 && (
        <p className="text-text-secondary text-sm leading-snug">
          <strong className="text-foreground">{g.talep} talebin</strong> {g.teklif_verilen}'ine teklif verildi ({oranMetni(g.teklif_verilen, g.talep, minBase)}), {g.reddedilen}'i reddedildi, {g.kabul}'ü numune ya da sonrasına geçti.
          {one.enIyi && <> En verimli kanal <strong className="text-foreground">{one.enIyi.label}</strong> (talep→sipariş {pct(one.enIyi.siparis_orani)}, {one.enIyi.talep} talep){one.enKotu && <>; en yüksek red oranı <strong className="text-foreground">{one.enKotu.label}</strong> ({pct(one.enKotu.red_orani)})</>}.</>}
        </p>
      )}
      <ReportSection title="Kanal × Huni">
        <ChannelFunnelTable rows={g.kanal_huni} labelHeader="Pazarlama kanalı" minBase={minBase} showCost={finans} paraBirimi={g.harcama_para_birimi} onRowClick={mk ? undefined : (row) => { const o = opts.data?.marketing.find((m) => m.label === row.label); if (o) setMk(String(o.value)) }} />
      </ReportSection>
      <ReportSection title="Talep eğilimi"><TrendChart points={g.egilim} unit={g.egilim_birim} /></ReportSection>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReportSection title="Gün × saat yoğunluğu">
          <Heatmap data={r.by_dow_hour ?? []} />
          <p className="text-text-muted text-xs">Koyu hücre = çok talep; çerçeveli hücre en yoğun saat. Reklam saat planı için.</p>
        </ReportSection>
        <ReportSection title="Dönüşüm hunisi"><Funnel steps={huni} /></ReportSection>
      </div>
      <ReportSection title="Kampanya × Huni">
        <ChannelFunnelTable rows={g.kampanya_huni.slice(0, 15)} labelHeader="Kampanya (utm_campaign)" minBase={minBase} compact showSpeed={false} empty="Kampanya verisi yok — reklam bağlantılarında utm_campaign kullanın." />
        {g.kampanya_huni.length > 15 && <p className="text-text-muted text-xs">İlk 15 kampanya gösteriliyor; tamamı CSV'de.</p>}
      </ReportSection>
      <ReportSection title="İl × Huni">
        <ChannelFunnelTable rows={g.il_huni.slice(0, 20)} labelHeader="İl" minBase={minBase} compact showSpeed={false} empty="İl verisi yok." />
      </ReportSection>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ReportSection title="Ürün kaynağına göre"><BarList rows={rows(r.by_product_source)} /></ReportSection>
        <ReportSection title="Red sebepleri"><BarList rows={rows(g.red_sebepleri)} barClass="bg-danger-foreground" empty="Bu dönemde red yok." /></ReportSection>
        <ReportSection title="Red sebebi × kanal">
          <DataTable cols={[{ key: 'sebep', label: 'Sebep' }, { key: 'kanal', label: 'Kanal' }, { key: 'count', label: 'Talep', align: 'right' }]}
            rows={(g.red_sebebi_kanal ?? []) as unknown as Record<string, unknown>[]} empty="Bu dönemde red yok." />
        </ReportSection>
      </div>
      <ReportSection title="Red sebebi × il">
        <DataTable cols={[{ key: 'sebep', label: 'Sebep' }, { key: 'il', label: 'İl' }, { key: 'count', label: 'Talep', align: 'right' }]}
          rows={(g.red_sebebi_il ?? []) as unknown as Record<string, unknown>[]} empty="Bu dönemde red yok." />
      </ReportSection>
    </div>
  )
}
