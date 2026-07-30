// Belge editörü — tip bazlı düzenleme formları. Gruplu bölümler, iki sütun; TAS kod
// doğrulaması + Oto üret; açılır menüler (grup/tür/para/geçerlilik/KDV/beden sistemi);
// sayısal fiyat/adet; sipariş formu bakım talimatları; sipariş onay tarih+imza; numune
// çoklu müşteri. Her form doğrudan render verisini düzenler.
/* eslint-disable @typescript-eslint/no-explicit-any, react-refresh/only-export-components */
import { useEffect, useId, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/shared/DatePicker'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2, Wand2, Image as ImageIcon, Lock } from 'lucide-react'
import { sanitizeTasBody, validateTasBody, TAS_PREFIX } from '@/lib/tasCode'
import { generateTasBody, fetchRates, useDocCategoryOptions } from '@/hooks/useDocuments'

export type Data = Record<string, any>

const CURRENCIES = [{ value: 'TRY', label: '₺ Türk Lirası' }, { value: 'USD', label: '$ Dolar' }, { value: 'EUR', label: '€ Euro' }, { value: 'GBP', label: '£ Sterlin' }]
const CUR_SYM: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' }
const VALIDITY = ['7 Gün', '14 Gün', '30 Gün']
const BEDEN_SETLERI: Record<string, string[]> = { Alfa: ['XS', 'S', 'M', 'L', 'XL'], Numara: ['34', '36', '38', '40', '42', '44', '46'], Özel: ['S', 'M', 'L'] }
// Sipariş formu bakım talimatları (studio.html BAKIM; def=varsayılan işaretli).
const BAKIM = [
  { k: '30', t: '30°C Yıka', def: true }, { k: '40', t: '40°C Yıka', def: false }, { k: 'handwash', t: 'Elde Yıka', def: false },
  { k: 'nobleach', t: 'Çamaşır Suyu Yok', def: true }, { k: 'iron', t: 'Ütü Orta', def: true }, { k: 'noiron', t: 'Ütülemeyin', def: false },
  { k: 'notumble', t: 'Kurutma Yok', def: true }, { k: 'dryclean', t: 'Kuru Temizleme', def: false }, { k: 'inside', t: 'Ters Yüz Yıka', def: true },
]
export const BAKIM_DEFAULTS = BAKIM.filter((b) => b.def).map((b) => b.k)
const trNum = (n: number) => Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Boş şablon — bağımsız belge (operasyon yok) için başlangıç verisi. */
export function blankData(typeKey: string): Data {
  switch (typeKey) {
    case 'fiyat_teklifi':
      return { tkS: { talep: '', musteri: '', grup: '', tur: '', gecerli: '7 Gün', teslimat: '', odeme: '%50 Ön Ödeme %50 Sevkiyat Öncesi', para: 'TRY', kdv: '20', indirim: '0', not: '', dil: 'tr', opts: [{ detay: '', kumas: '', adet: '', birim: '', oner: false }] } }
    case 'siparis_onay':
      return { soS: { kod: '', dtarih: '', ftarih: '', musteri: '', yetkili: '', grup: '', tur: '', kumas: '', renk: '', beden: '', adet: '', birim: '', tutar: '', termin: '', para: 'TRY', sgAd: '', sgUnvan: '', sgTarih: '', mgAd: '', mgUnvan: '', mgTarih: '' } }
    case 'numune_etiketi':
      return { norder: { musteri: '', urunkodu: '' }, numuneler: [{ musteri: '', urunkodu: '', beden: '', renk: '' }] }
    case 'siparis_formu':
      return { sip: { no6: '', urunkodu: '', tarih: '', toplam: '', alici: { unvan: '', vno: '', vd: '', adres: '' }, grup: '', tur: '', bsistem: 'Alfa', bedenler: BEDEN_SETLERI.Alfa!.slice(), renkler: [], kompozisyon: '', bakim: BAKIM_DEFAULTS.slice(), yorum: '', para: 'TRY', birim: '', tavsiye: '', odeme: '%50 Ön Ödeme %50 Sevkiyat Öncesi' } }
    case 'koli_ustu':
      return { order: { musteri: '', icerik: '', adres: '', toplam: 1 }, koliler: [{ renk: '', beden: '', adet: '', agirlik: '' }] }
    default:
      return {}
  }
}

/** Numune: op'tan gelen tek norder → ilk satıra tohumla (çoklu müşteri düzenine geçiş). */
export function seedInitial(typeKey: string, data: Data): Data {
  if (typeKey === 'numune_etiketi') {
    const n = data.norder || {}
    let list: Data[] = data.numuneler || []
    if (!list.length) list = [{ musteri: '', urunkodu: '', beden: '', renk: '' }]
    list = list.map((it) => ({ musteri: it.musteri || n.musteri || '', urunkodu: it.urunkodu || n.urunkodu || '', beden: it.beden || '', renk: it.renk || '' }))
    return { ...data, numuneler: list }
  }
  return data
}

/** koli_ustu: her koli müşteri/içerik/adres'i başlıktan devralır (stickerHTML k.* okur). */
export function normalizeForRender(typeKey: string, data: Data): Data {
  if (typeKey === 'koli_ustu') {
    const o = data.order || {}
    const koliler = (data.koliler || []).map((k: Data) => ({
      musteri: o.musteri || '', icerik: o.icerik || '', adres: o.adres || '',
      renk: k.renk || '', beden: k.beden || '', adet: k.adet || '', agirlik: k.agirlik || '',
    }))
    return { ...data, order: { ...o, toplam: koliler.length || 1 }, koliler }
  }
  return data
}

// ── düzen yardımcıları ────────────────────────────────────────────────────
function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted border-b border-border pb-1.5">{title}</h3>
      {children}
    </section>
  )
}
function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-3 gap-y-3">{children}</div>
}
function T({ label, value, onChange, placeholder, wide }: { label: string; value: any; onChange: (v: string) => void; placeholder?: string; wide?: boolean }) {
  const id = useId()
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <Label htmlFor={id} className="text-xs text-text-muted whitespace-nowrap">{label}</Label>
      <Input id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-1" />
    </div>
  )
}
/** Sayısal alan (A6/A7): rakam + isteğe bağlı ondalık; nokta ondalık, gövdede binlik yok. */
function NumField({ label, value, onChange, decimals = true, placeholder, wide }: { label: string; value: any; onChange: (v: string) => void; decimals?: boolean; placeholder?: string; wide?: boolean }) {
  const id = useId()
  const sanitize = (raw: string) => {
    let s = raw.replace(',', '.').replace(decimals ? /[^0-9.]/g : /[^0-9]/g, '')
    if (decimals) { const p = s.split('.'); s = p.length > 1 ? p[0] + '.' + p.slice(1).join('').slice(0, 2) : s }
    return s
  }
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <Label htmlFor={id} className="text-xs text-text-muted whitespace-nowrap">{label}</Label>
      <Input id={id} inputMode={decimals ? 'decimal' : 'numeric'} value={value ?? ''} onChange={(e) => onChange(sanitize(e.target.value))} placeholder={placeholder} className="mt-1" />
    </div>
  )
}
function D({ label, value, onChange, wide }: { label: string; value: any; onChange: (v: string) => void; wide?: boolean }) {
  const id = useId()
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <Label htmlFor={id} className="text-xs text-text-muted whitespace-nowrap">{label}</Label>
      <DatePicker id={id} value={value || null} onChange={(v) => onChange(v ?? '')} clearable className="mt-1 w-full" />
    </div>
  )
}
function TA({ label, value, onChange, placeholder }: { label: string; value: any; onChange: (v: string) => void; placeholder?: string }) {
  const id = useId()
  return (
    <div className="col-span-2">
      <Label htmlFor={id} className="text-xs text-text-muted">{label}</Label>
      <Textarea id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-1" rows={2} />
    </div>
  )
}
function Sel({ label, value, onChange, options, placeholder, wide, clearable }: { label: string; value: any; onChange: (v: string | null) => void; options: { value: string; label: string }[]; placeholder?: string; wide?: boolean; clearable?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <Label className="text-xs text-text-muted whitespace-nowrap">{label}</Label>
      <SearchableSelect options={options} value={value || null} onChange={onChange} placeholder={placeholder} clearable={clearable} className="mt-1" />
    </div>
  )
}

/** TAS kod alanı (A1/A2): "TAS-" öneki + 6 karakter (A-Z/2-9), doğrulama + Oto üret.
 *  value = öneksiz 6 karakter gövde (şablon öneki kendi ekler). */
function TasField({ label, value, onChange, wide }: { label: string; value: string; onChange: (body: string) => void; wide?: boolean }) {
  const id = useId()
  const [busy, setBusy] = useState(false)
  const err = validateTasBody(value || '')
  async function oto() {
    setBusy(true)
    try { onChange(await generateTasBody()) } catch { toast.error('Kod üretilemedi.') } finally { setBusy(false) }
  }
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <Label htmlFor={id} className="text-xs text-text-muted whitespace-nowrap">{label}</Label>
      <div className="mt-1 flex gap-1.5">
        <div className="flex flex-1 items-stretch overflow-hidden rounded-md border border-border focus-within:ring-1 focus-within:ring-ring">
          <span className="flex items-center bg-muted px-2 text-sm font-medium text-text-muted">{TAS_PREFIX}-</span>
          <input id={id} value={value ?? ''} onChange={(e) => onChange(sanitizeTasBody(e.target.value))} placeholder="A7K2M9" maxLength={6}
            className="w-full bg-transparent px-2 py-1.5 text-sm font-mono tracking-wider uppercase outline-none" />
        </div>
        <Button type="button" size="sm" variant="outline" onClick={oto} disabled={busy} title="Oto üret">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />} Oto üret
        </Button>
      </div>
      {err && value ? <p className="mt-1 text-xs text-destructive">{err}</p> : <p className="mt-1 text-xs text-text-muted">Büyük harf ve rakam; I, O, 0, 1 kullanılmaz.</p>}
    </div>
  )
}

/** Ürün görseli (B2): yükle → data URL + oran (fotoAR) hesapla, önizleme+belgede görünür. */
function PhotoField({ value, onChange }: { value: string | undefined; onChange: (foto: string, ar: number) => void }) {
  const id = useId()
  const [busy, setBusy] = useState(false)
  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Lütfen bir görsel seçin.'); return }
    if (file.size > 4 * 1024 * 1024) { toast.error('Görsel 4 MB’den küçük olmalı.'); return }
    setBusy(true)
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result || '')
      const img = new Image()
      img.onload = () => { onChange(url, img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0.75); setBusy(false) }
      img.onerror = () => { onChange(url, 0.75); setBusy(false) }
      img.src = url
    }
    reader.onerror = () => { toast.error('Görsel okunamadı.'); setBusy(false) }
    reader.readAsDataURL(file)
  }
  return (
    <div className="mt-3">
      <Label className="text-xs text-text-muted">Ürün Görseli (opsiyonel)</Label>
      <div className="mt-1 flex items-center gap-3">
        {value ? <img src={value} alt="ürün" className="size-16 rounded border border-border object-cover" /> : <div className="flex size-16 items-center justify-center rounded border border-dashed border-border text-text-muted"><ImageIcon className="size-5" /></div>}
        <div className="flex gap-2">
          <input id={id} type="file" accept="image/*" onChange={pick} className="hidden" />
          <Button type="button" size="sm" variant="outline" onClick={() => document.getElementById(id)?.click()} disabled={busy}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ImageIcon className="size-3.5" />} {value ? 'Değiştir' : 'Görsel yükle'}
          </Button>
          {value && <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => onChange('', 0)}>Kaldır</Button>}
        </div>
      </div>
    </div>
  )
}

/** Geçerlilik: 7/14/30 Gün hazır + Özel (serbest metin). */
function ValidityField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isPreset = VALIDITY.includes(value)
  return (
    <div>
      <Label className="text-xs text-text-muted whitespace-nowrap">Geçerlilik</Label>
      <SearchableSelect className="mt-1" options={[...VALIDITY.map((v) => ({ value: v, label: v })), { value: 'Özel', label: 'Özel…' }]}
        value={isPreset ? value : 'Özel'} onChange={(v) => onChange(v === 'Özel' ? '' : (v ?? ''))} />
      {!isPreset && <Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder="Örn. 10 Gün" className="mt-1.5" />}
    </div>
  )
}

/** Ürün Grubu (Grup/Dal) + Türü açılır menüleri (A3). Etiket saklar, türü gruba göre süzer. */
function CategorySelect({ grup, tur, onGrup, onTur }: { grup: string; tur: string; onGrup: (v: string) => void; onTur: (v: string) => void }) {
  const { data } = useDocCategoryOptions()
  const groups = data?.groups ?? []
  const gid = groups.find((g) => g.label === grup)?.id
  const types = gid != null ? (data?.typesByGroup[gid] ?? []) : []
  return (
    <>
      <Sel label="Ürün Grubu" value={grup} onChange={(v) => { onGrup(v ?? ''); onTur('') }} options={groups.map((g) => ({ value: g.label, label: g.label }))} placeholder="Grup / Dal seçin" clearable />
      <Sel label="Ürün Türü" value={tur} onChange={(v) => onTur(v ?? '')} options={types.map((t) => ({ value: t.label, label: t.label }))} placeholder={gid != null ? 'Tür seçin' : 'Önce grup seçin'} clearable />
    </>
  )
}

/** İç Not (QA#10) — görsel olarak ayrışır (kilit + sarı zemin). data.internalNote (üst seviye);
 *  stripInternal ile önizleme+PDF'ten AYIKLANIR, yalnız belge kaydında (documents.data) durur. */
function InternalNoteField({ data, set }: { data: Data; set: (d: Data) => void }) {
  return (
    <div className="col-span-2 rounded-md border border-warning bg-warning-badge/40 p-3">
      <Label className="flex items-center gap-1.5 text-xs font-semibold text-warning-foreground">
        <Lock className="size-3.5" /> İç Not (yalnız ekip)
      </Label>
      <Textarea value={data.internalNote ?? ''} onChange={(e) => set({ ...data, internalNote: e.target.value })}
        rows={2} className="mt-1.5 bg-card" placeholder="Ekip içi not — müşteriye gitmez…" />
      <p className="mt-1 text-xs text-warning-foreground">Bu not müşteriye gitmez, belgeye yazılmaz.</p>
    </div>
  )
}

/** Satır sırala/sil kontrolleri (yukarı/aşağı/çöp). */
function RowControls<TItem>({ list, i, set, min = 1 }: { list: TItem[]; i: number; set: (l: TItem[]) => void; min?: number }) {
  const move = (dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= list.length) return
    const c = list.slice(); const tmp = c[i]!; c[i] = c[j]!; c[j] = tmp; set(c)
  }
  return (
    <div className="flex items-center gap-0.5">
      <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => move(-1)} disabled={i === 0}><ChevronUp className="size-3.5" /></Button>
      <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => move(1)} disabled={i === list.length - 1}><ChevronDown className="size-3.5" /></Button>
      <Button type="button" size="icon" variant="ghost" className="size-7 text-destructive" onClick={() => set(list.filter((_, j) => j !== i))} disabled={list.length <= min}><Trash2 className="size-3.5" /></Button>
    </div>
  )
}

// ── Fiyat Teklifi ─────────────────────────────────────────────────────────
function FiyatTeklifiForm({ data, set }: { data: Data; set: (d: Data) => void }) {
  const s = data.tkS || {}
  const up = (patch: Data) => set({ ...data, tkS: { ...s, ...patch } })
  const opts: Data[] = s.opts || []
  const setOpts = (o: Data[]) => up({ opts: o })
  const taxOpts: number[] = data._taxOptions || [0, 1, 10, 20]
  const foreign = s.para && s.para !== 'TRY'
  const rate = foreign ? data.rates?.[s.para] : null

  // B1 — Para birimi TRY değilse TCMB kurunu çek (bir kez), belgeye TL karşılığı + not girer.
  useEffect(() => {
    if (!foreign) return
    if (data.rates && data.rates[s.para] != null) return
    let cancelled = false
    fetchRates().then((r) => { if (r && !cancelled) set({ ...data, rates: { ...(data.rates || {}), ...r } }) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.para])

  return (
    <div className="space-y-6">
      <FieldGroup title="Temel Bilgiler">
        <Grid>
          <TasField label="Talep No" value={s.talep} onChange={(v) => up({ talep: v })} />
          <T label="Müşteri" value={s.musteri} onChange={(v) => up({ musteri: v })} />
          <CategorySelect grup={s.grup} tur={s.tur} onGrup={(v) => up({ grup: v })} onTur={(v) => up({ tur: v })} />
        </Grid>
        <PhotoField value={s.foto} onChange={(foto, ar) => up({ foto, fotoAR: ar })} />
      </FieldGroup>

      <FieldGroup title="Ticari Koşullar">
        <Grid>
          <Sel label="Para Birimi" value={s.para} onChange={(v) => up({ para: v ?? 'TRY' })} options={CURRENCIES} />
          <ValidityField value={s.gecerli} onChange={(v) => up({ gecerli: v })} />
          <Sel label="KDV (%)" value={String(s.kdv ?? '')} onChange={(v) => up({ kdv: v ?? '' })} options={taxOpts.map((r) => ({ value: String(r), label: `%${r}` }))} />
          <NumField label="İndirim (%)" value={s.indirim} onChange={(v) => up({ indirim: v })} placeholder="0" />
          <D label="Öngörülen Teslimat" value={s.teslimat} onChange={(v) => up({ teslimat: v })} />
          <T label="Ödeme Koşulu" value={s.odeme} onChange={(v) => up({ odeme: v })} />
        </Grid>
        {foreign && (
          <p className="text-xs text-text-muted">
            {rate != null
              ? `Kur: 1 ${s.para} = ${trNum(rate)} ₺ (${data.rates?.source || 'TCMB'}${data.rates?.date ? ' · ' + data.rates.date : ''}). Belgede TL karşılığı gösterilir.`
              : 'Kur alınıyor… (alınamazsa belgede yalnızca döviz gösterilir).'}
          </p>
        )}
      </FieldGroup>

      <FieldGroup title="Üretim Seçenekleri">
        <div className="space-y-2">
          {opts.map((o, i) => (
            <div key={i} className="rounded-md border border-border p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-muted">Seçenek {i + 1}</span>
                <RowControls list={opts} i={i} set={setOpts} />
              </div>
              <Grid>
                <T label="Detay" value={o.detay} onChange={(v) => setOpts(opts.map((x, j) => j === i ? { ...x, detay: v } : x))} />
                <T label="Kumaş" value={o.kumas} onChange={(v) => setOpts(opts.map((x, j) => j === i ? { ...x, kumas: v } : x))} />
                <NumField label="Adet" value={o.adet} decimals={false} onChange={(v) => setOpts(opts.map((x, j) => j === i ? { ...x, adet: v } : x))} />
                <NumField label={`Birim Fiyat (${CUR_SYM[s.para] || '₺'})`} value={o.birim} onChange={(v) => setOpts(opts.map((x, j) => j === i ? { ...x, birim: v } : x))} />
              </Grid>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-text-muted">
                  <input type="checkbox" checked={!!o.oner} onChange={(e) => setOpts(opts.map((x, j) => j === i ? { ...x, oner: e.target.checked } : x))} />
                  Önerilen seçenek
                </label>
                {/* QA#4g — adet × birim anlık toplam */}
                <span className="text-xs text-text-secondary">Toplam: <b className="text-foreground">{trNum((parseFloat(String(o.birim).replace(',', '.')) || 0) * (parseInt(String(o.adet).replace(/\D/g, ''), 10) || 0))} {CUR_SYM[s.para] || '₺'}</b></span>
              </div>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => setOpts([...opts, { detay: '', kumas: '', adet: '', birim: '', oner: false }])}>
            <Plus className="size-3.5" /> Seçenek ekle
          </Button>
        </div>
      </FieldGroup>

      <FieldGroup title="Notlar">
        <Grid><TA label="Not" value={s.not} onChange={(v) => up({ not: v })} /><InternalNoteField data={data} set={set} /></Grid>
      </FieldGroup>
    </div>
  )
}

// ── Sipariş Onay Formu ────────────────────────────────────────────────────
function SiparisOnayForm({ data, set }: { data: Data; set: (d: Data) => void }) {
  const s = data.soS || {}
  const cur = s.para || 'TRY'
  const sym = CUR_SYM[cur] || '₺'
  // Birim fiyat + para + adet → görünen birim ("1.850,00 ₺") ve otomatik toplam tutar.
  const recompute = (patch: Data) => {
    const next = { ...s, ...patch }
    const bn = parseFloat(String(next._birimNum || '').replace(',', '.'))
    const ad = parseFloat(String(next.adet || '').replace(/[^0-9.]/g, ''))
    const c = CUR_SYM[next.para || 'TRY'] || '₺'
    next.birim = next._birimNum ? `${trNum(bn)} ${c}` : ''
    next.tutar = (bn && ad) ? `${trNum(bn * ad)} ${c}` : ''
    set({ ...data, soS: next })
  }
  const up = (patch: Data) => set({ ...data, soS: { ...s, ...patch } })
  return (
    <div className="space-y-6">
      <FieldGroup title="Temel Bilgiler">
        <Grid>
          <TasField label="Belge / Form No" value={s.kod} onChange={(v) => up({ kod: v })} />
          <D label="Düzenleme Tarihi" value={s.dtarih} onChange={(v) => up({ dtarih: v })} />
          <T label="Müşteri / Marka" value={s.musteri} onChange={(v) => up({ musteri: v })} />
          <T label="Yetkili Kişi" value={s.yetkili} onChange={(v) => up({ yetkili: v })} />
          <D label="Form Tarihi" value={s.ftarih} onChange={(v) => up({ ftarih: v })} />
        </Grid>
      </FieldGroup>

      <FieldGroup title="Üretim Detayları">
        <Grid>
          <CategorySelect grup={s.grup} tur={s.tur} onGrup={(v) => up({ grup: v })} onTur={(v) => up({ tur: v })} />
          <T label="Kumaş Detayı" value={s.kumas} onChange={(v) => up({ kumas: v })} wide />
          <T label="Renk / Kod" value={s.renk} onChange={(v) => up({ renk: v })} />
          <T label="Beden Seti (Dağılımı)" value={s.beden} onChange={(v) => up({ beden: v })} />
          <NumField label="Toplam Sipariş Adedi" value={s.adet} decimals={false} onChange={(v) => recompute({ adet: v })} />
        </Grid>
      </FieldGroup>

      <FieldGroup title="Fiyat ve Termin">
        <Grid>
          <NumField label="Birim Fiyat" value={s._birimNum} onChange={(v) => recompute({ _birimNum: v })} />
          <Sel label="Para Birimi" value={cur} onChange={(v) => recompute({ para: v ?? 'TRY' })} options={CURRENCIES} />
          <T label="Öngörülen Toplam" value={s.tutar} onChange={() => {}} placeholder="otomatik" />
          <NumField label="Termin (iş günü)" value={s.termin} decimals={false} onChange={(v) => up({ termin: v })} />
        </Grid>
        <p className="text-xs text-text-muted">Toplam tutar birim fiyat × adet ile otomatik hesaplanır ({sym}).</p>
      </FieldGroup>

      <FieldGroup title="İmza Bölümü">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border border-border p-2.5 space-y-2">
            <div className="text-xs font-medium">Üretici (Tekstil A.Ş.)</div>
            <T label="Ad / Soyad" value={s.sgAd} onChange={(v) => up({ sgAd: v })} />
            <T label="Unvan" value={s.sgUnvan} onChange={(v) => up({ sgUnvan: v })} />
            <D label="Tarih" value={s.sgTarih} onChange={(v) => up({ sgTarih: v })} />
          </div>
          <div className="rounded-md border border-border p-2.5 space-y-2">
            <div className="text-xs font-medium">Müşteri / Marka Onayı</div>
            <T label="Ad / Soyad" value={s.mgAd} onChange={(v) => up({ mgAd: v })} />
            <T label="Unvan" value={s.mgUnvan} onChange={(v) => up({ mgUnvan: v })} />
            <D label="Tarih" value={s.mgTarih} onChange={(v) => up({ mgTarih: v })} />
          </div>
        </div>
      </FieldGroup>

      <FieldGroup title="Notlar">
        <Grid><InternalNoteField data={data} set={set} /></Grid>
      </FieldGroup>
    </div>
  )
}

// ── Numune Etiketi (çoklu müşteri) ────────────────────────────────────────
function NumuneForm({ data, set }: { data: Data; set: (d: Data) => void }) {
  const list: Data[] = data.numuneler || []
  const setList = (l: Data[]) => set({ ...data, numuneler: l })
  const upRow = (i: number, patch: Data) => setList(list.map((x, j) => j === i ? { ...x, ...patch } : x))
  const addRow = () => { const last = list[list.length - 1] || {}; setList([...list, { musteri: last.musteri || '', urunkodu: last.urunkodu || '', beden: '', renk: '' }]) }
  return (
    <div className="space-y-6">
      <FieldGroup title={`Numune Etiketleri (${list.length}) — A4 başına 4 etiket`}>
        <p className="text-xs text-text-muted">Her satır ayrı etiket; farklı müşteriler tek çıktıda birleşebilir. Barkod: kod|beden|renk.</p>
        <div className="space-y-2">
          {list.map((it, i) => (
            <div key={i} className="rounded-md border border-border p-2.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium">Etiket {i + 1}</span>
                <RowControls list={list} i={i} set={setList} />
              </div>
              <Grid>
                <T label="Müşteri" value={it.musteri} onChange={(v) => upRow(i, { musteri: v })} />
                <TasField label="Ürün Kodu" value={it.urunkoduBody ?? tasBodyOf(it.urunkodu)} onChange={(v) => upRow(i, { urunkoduBody: v, urunkodu: v.length === 6 ? `${TAS_PREFIX}-${v}` : '' })} />
                <T label="Beden" value={it.beden} onChange={(v) => upRow(i, { beden: v })} />
                <T label="Renk" value={it.renk} onChange={(v) => upRow(i, { renk: v })} />
              </Grid>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={addRow}><Plus className="size-3.5" /> Etiket ekle</Button>
        </div>
      </FieldGroup>
    </div>
  )
}
function tasBodyOf(full: string): string {
  if (!full) return ''
  const i = String(full).lastIndexOf('-')
  return sanitizeTasBody(i >= 0 ? String(full).slice(i + 1) : String(full))
}

// ── Koli Üstü Etiketi (çoklu) ─────────────────────────────────────────────
function KoliForm({ data, set }: { data: Data; set: (d: Data) => void }) {
  const o = data.order || {}
  const list: Data[] = data.koliler || []
  const upO = (patch: Data) => set({ ...data, order: { ...o, ...patch } })
  const setList = (l: Data[]) => set({ ...data, koliler: l })
  return (
    <div className="space-y-6">
      <FieldGroup title="Temel Bilgiler">
        <Grid>
          <T label="Müşteri" value={o.musteri} onChange={(v) => upO({ musteri: v })} />
          <T label="Koli İçeriği (serbest metin)" value={o.icerik} onChange={(v) => upO({ icerik: v })} />
          <T label="Teslim Adresi" value={o.adres} onChange={(v) => upO({ adres: v })} wide />
        </Grid>
        <p className="text-xs text-text-muted">Koli içeriği serbest metindir (ürün kodu ya da açıklama). Müşteri / içerik / adres tüm kolilere uygulanır.</p>
      </FieldGroup>

      <FieldGroup title={`Koliler (${list.length}) — A4 başına 2 etiket`}>
        <div className="space-y-2">
          {list.map((k, i) => (
            <div key={i} className="rounded-md border border-border p-2.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium">Koli {i + 1} / {list.length || 1}</span>
                <RowControls list={list} i={i} set={setList} />
              </div>
              <Grid>
                <T label="Renk" value={k.renk} onChange={(v) => setList(list.map((x, j) => j === i ? { ...x, renk: v } : x))} />
                <T label="Beden" value={k.beden} onChange={(v) => setList(list.map((x, j) => j === i ? { ...x, beden: v } : x))} />
                <NumField label="Koli içi adet" value={k.adet} decimals={false} onChange={(v) => setList(list.map((x, j) => j === i ? { ...x, adet: v } : x))} />
                <T label="Ağırlık" value={k.agirlik} onChange={(v) => setList(list.map((x, j) => j === i ? { ...x, agirlik: v } : x))} />
              </Grid>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => setList([...list, { renk: '', beden: '', adet: '', agirlik: '' }])}>
            <Plus className="size-3.5" /> Koli ekle
          </Button>
        </div>
      </FieldGroup>
    </div>
  )
}

// ── Sipariş Formu (renk×beden matris + bakım) ─────────────────────────────
function SiparisFormuForm({ data, set }: { data: Data; set: (d: Data) => void }) {
  const s = data.sip || {}
  const up = (patch: Data) => set({ ...data, sip: { ...s, ...patch } })
  const bedenler: string[] = s.bedenler || []
  const renkler: Data[] = s.renkler || []
  const bakim: string[] = s.bakim || []
  const setRenkler = (r: Data[]) => up({ renkler: r })
  const setQ = (ri: number, b: string, v: string) => setRenkler(renkler.map((r, j) => j === ri ? { ...r, q: { ...(r.q || {}), [b]: v } } : r))
  // Sipariş No (no6) → ürün kodu otomatik TAS-no6 (E1/E2).
  const setNo6 = (body: string) => up({ no6: body, urunkodu: body.length === 6 ? `${TAS_PREFIX}-${body}` : '' })
  // Beden sistemi → hazır set (Özel'de dokunma).
  const setBsistem = (v: string) => { const bs = BEDEN_SETLERI[v]; if (v !== 'Özel' && bs) up({ bsistem: v, bedenler: bs.slice() }); else up({ bsistem: v }) }
  const toggleBakim = (k: string) => up({ bakim: bakim.includes(k) ? bakim.filter((x) => x !== k) : [...bakim, k] })
  return (
    <div className="space-y-6">
      <FieldGroup title="Temel Bilgiler">
        <Grid>
          <TasField label="Sipariş No" value={s.no6} onChange={setNo6} />
          <T label="Ürün Kodu (otomatik)" value={s.urunkodu || (s.no6?.length === 6 ? `${TAS_PREFIX}-${s.no6}` : '')} onChange={() => {}} placeholder="Sipariş No ile aynı" />
          <D label="Değişiklik Tarihi" value={s.tarih} onChange={(v) => up({ tarih: v })} />
          <Sel label="Beden Sistemi" value={s.bsistem} onChange={(v) => setBsistem(v ?? 'Alfa')} options={Object.keys(BEDEN_SETLERI).map((k) => ({ value: k, label: k }))} />
          <CategorySelect grup={s.grup} tur={s.tur} onGrup={(v) => up({ grup: v })} onTur={(v) => up({ tur: v })} />
          <T label="Bedenler (virgülle)" value={bedenler.join(', ')} onChange={(v) => up({ bedenler: v.split(',').map((x) => x.trim()).filter(Boolean) })} wide />
        </Grid>
      </FieldGroup>

      <FieldGroup title="Alıcı Bilgileri">
        <Grid>
          <T label="Ünvan" value={s.alici?.unvan} onChange={(v) => up({ alici: { ...s.alici, unvan: v } })} />
          <T label="Vergi No" value={s.alici?.vno} onChange={(v) => up({ alici: { ...s.alici, vno: v } })} />
          <T label="Vergi Dairesi" value={s.alici?.vd} onChange={(v) => up({ alici: { ...s.alici, vd: v } })} />
          <T label="Adres" value={s.alici?.adres} onChange={(v) => up({ alici: { ...s.alici, adres: v } })} />
        </Grid>
      </FieldGroup>

      <FieldGroup title="Renk × Beden Dağılımı">
        {renkler.length > 0 && (
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left text-xs text-text-muted">Renk</th>
                  {bedenler.map((b) => <th key={b} className="px-1 py-1 text-xs text-text-muted">{b}</th>)}
                  <th />
                </tr>
              </thead>
              <tbody>
                {renkler.map((r, ri) => (
                  <tr key={ri}>
                    <td className="pr-2">
                      <div className="flex items-center gap-1">
                        <input type="color" value={r.hex || '#1f2f57'} onChange={(e) => setRenkler(renkler.map((x, j) => j === ri ? { ...x, hex: e.target.value } : x))} className="size-6 rounded border border-border p-0" />
                        <Input value={r.ad ?? ''} onChange={(e) => setRenkler(renkler.map((x, j) => j === ri ? { ...x, ad: e.target.value } : x))} placeholder="Renk adı" className="h-8 w-28" />
                      </div>
                    </td>
                    {bedenler.map((b) => (
                      <td key={b} className="px-0.5">
                        <Input value={r.q?.[b] ?? ''} onChange={(e) => setQ(ri, b, e.target.value.replace(/\D/g, ''))} className="h-8 w-12 text-center" />
                      </td>
                    ))}
                    <td className="pl-1"><RowControls list={renkler} i={ri} set={setRenkler} min={0} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Button type="button" size="sm" variant="outline" onClick={() => setRenkler([...renkler, { ad: '', hex: '#1f2f57', q: {} }])}>
          <Plus className="size-3.5" /> Renk ekle
        </Button>
      </FieldGroup>

      <FieldGroup title="Ticari Koşullar">
        <Grid>
          <NumField label="Toplam Adet (boş = matristen)" value={s.toplam} decimals={false} onChange={(v) => up({ toplam: v })} />
          <Sel label="Para Birimi" value={s.para} onChange={(v) => up({ para: v ?? 'TRY' })} options={CURRENCIES} />
          <NumField label={`Birim Fiyat (${CUR_SYM[s.para] || '₺'})`} value={s.birim} onChange={(v) => up({ birim: v })} />
          <NumField label={`Tavsiye Satış (${CUR_SYM[s.para] || '₺'})`} value={s.tavsiye} onChange={(v) => up({ tavsiye: v })} />
          <T label="Ödeme Şekli" value={s.odeme} onChange={(v) => up({ odeme: v })} wide />
        </Grid>
      </FieldGroup>

      <FieldGroup title="Bakım Talimatları">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {BAKIM.map((b) => (
            <label key={b.k} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={bakim.includes(b.k)} onChange={() => toggleBakim(b.k)} />
              {b.t}
            </label>
          ))}
        </div>
      </FieldGroup>

      <FieldGroup title="Notlar">
        <Grid>
          <T label="Kompozisyon" value={s.kompozisyon} onChange={(v) => up({ kompozisyon: v })} wide />
          <TA label="Yorum / Not" value={s.yorum} onChange={(v) => up({ yorum: v })} />
          <InternalNoteField data={data} set={set} />
        </Grid>
      </FieldGroup>
    </div>
  )
}

/** Tip → form eşlemesi. */
export function EditorForm({ typeKey, data, set }: { typeKey: string; data: Data; set: (d: Data) => void }) {
  switch (typeKey) {
    case 'fiyat_teklifi': return <FiyatTeklifiForm data={data} set={set} />
    case 'siparis_onay': return <SiparisOnayForm data={data} set={set} />
    case 'numune_etiketi': return <NumuneForm data={data} set={set} />
    case 'siparis_formu': return <SiparisFormuForm data={data} set={set} />
    case 'koli_ustu': return <KoliForm data={data} set={set} />
    default: return <p className="text-text-muted">Bu belge tipi için form yok.</p>
  }
}
