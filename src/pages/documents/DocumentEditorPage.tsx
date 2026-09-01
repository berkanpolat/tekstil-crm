import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom'
import { Loader2, FileText, Globe, X, FileEdit, AlertTriangle } from 'lucide-react'
import { hasPdfService, PDF_UNAVAILABLE } from '@/lib/env'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { toUserMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { getSignedUrl } from '@/hooks/useFiles'
import {
  useGenerateDocument, useDocumentForEdit, buildDocumentData, fetchPreviewHtml, fetchUretici, fetchOperationPhoto,
  fetchDocDefaults, generateTasBody, type DocumentTypeKey,
} from '@/hooks/useDocuments'
import { EditorForm, blankData, normalizeForRender, seedInitial, type Data } from './editorForms'
import { RateBadge } from '@/pages/catalog/RateBadge'

const TYPE_LABEL: Record<DocumentTypeKey, string> = {
  fiyat_teklifi: 'Fiyat Teklifi', siparis_onay: 'Sipariş Onay Formu',
  numune_etiketi: 'Numune Etiketi', siparis_formu: 'Sipariş Formu', koli_ustu: 'Koli Üstü Etiketi',
}
const VALID_TYPES = Object.keys(TYPE_LABEL) as DocumentTypeKey[]
const PAGE_W = 794 // A4 genişliği @96dpi
const ZOOMS = [0.5, 0.75, 1] as const

/**
 * Tam sayfa belge editörü (P4A.4). Kendi rotası: /belgeler/yeni/:tip · /belgeler/:id/duzenle.
 * SOL (%40) kayan form — gruplu; SAĞ (%60) canlı önizleme — zoom'lu, tüm belge görünür.
 * Mobilde form/önizleme sekmeli. Beş belge tipinde aynı yapı.
 */
export function DocumentEditorPage({ mode }: { mode: 'new' | 'edit' }) {
  const params = useParams()
  const [sp] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const gen = useGenerateDocument()

  const editId = mode === 'edit' ? Number(params.id) : null
  const editDoc = useDocumentForEdit(editId)

  const [typeKey, setTypeKey] = useState<DocumentTypeKey | null>(
    mode === 'new' && VALID_TYPES.includes(params.tip as DocumentTypeKey) ? (params.tip as DocumentTypeKey) : null,
  )
  const [operationId, setOperationId] = useState<number | null>(
    mode === 'new' && sp.get('op') ? Number(sp.get('op')) : null,
  )
  const [data, setData] = useState<Data | null>(null)
  const [language, setLanguage] = useState<'tr' | 'en'>('tr')
  const [loading, setLoading] = useState(true)
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [zoom, setZoom] = useState<number>(0.75)
  const [docHeight, setDocHeight] = useState(1123)
  const [view, setView] = useState<'form' | 'preview'>('form') // mobil sekme

  const cancel = () => navigate('/belgeler')

  // Yeni belge: tip param'dan; geçersizse listeye dön.
  useEffect(() => {
    if (mode !== 'new') return
    if (!typeKey) { toast.error('Geçersiz belge tipi.'); navigate('/belgeler'); return }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        // Katalogdan gelen dolu veri (P4B.8) / taslak köprüsü (P8A) → boş şablon veya server
        // verisi yerine kullan. Prefill, operasyona bağlı olsa bile ÖNCELİKLİDİR (köprü fiyat
        // satırlarını + görseli hazır getirir; server build_document_data bunları ezmemeli).
        const prefill = (location.state as { prefill?: Data } | null)?.prefill
        const initial = (prefill && typeKey === 'fiyat_teklifi') ? { ...blankData(typeKey), ...prefill }
          : operationId != null ? await buildDocumentData(operationId, typeKey, 'tr')
          : blankData(typeKey)
        if (!initial.uretici) initial.uretici = await fetchUretici()
        // Ayar varsayılanları: KDV listesi (dropdown) + bağımsız fiyat teklifinde KDV/ödeme/geçerlilik.
        const def = await fetchDocDefaults()
        initial._taxOptions = def.taxOptions
        if (operationId == null && typeKey === 'fiyat_teklifi' && initial.tkS) {
          initial.tkS.kdv = def.taxRate; initial.tkS.odeme = def.paymentTerms; initial.tkS.gecerli = `${def.validityDays} Gün`
          // QA#4d/4e — bağımsız/katalog teklifinde boş alanlar: talep no oto-üret, teslimat bugün+7.
          if (!initial.tkS.talep) { try { initial.tkS.talep = await generateTasBody() } catch { /* elle girilir */ } }
          if (!initial.tkS.teslimat) initial.tkS.teslimat = new Date(Date.now() + def.validityDays * 864e5).toISOString().slice(0, 10)
        }
        // 1.9 — Talep görseli fiyat teklifine otomatik gelsin (elle yüklemeye gerek yok).
        if (typeKey === 'fiyat_teklifi' && operationId != null && initial.tkS && !initial.tkS.foto) {
          const p = await fetchOperationPhoto(operationId)
          if (p && !cancelled) { initial.tkS.foto = p.foto; initial.tkS.fotoAR = p.ar }
        }
        const seeded = seedInitial(typeKey, initial)
        if (!cancelled) setData(seeded)
      } catch (err) {
        if (!cancelled) { toast.error(await toUserMessage(err)); navigate('/belgeler') }
      } finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, typeKey, operationId])

  // Düzenleme: mevcut belgeyi yükle.
  useEffect(() => {
    if (mode !== 'edit') return
    if (editDoc.error) { void toUserMessage(editDoc.error).then((m) => toast.error(m)); navigate('/belgeler'); return }
    if (!editDoc.data) return
    const d = editDoc.data
    // react-query önbelleğinden düzenlenebilir yerel duruma senkron (dış sistem → state).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTypeKey(d.type_key); setOperationId(d.operation_id)
    setLanguage(d.language === 'en' ? 'en' : 'tr')
    const base = seedInitial(d.type_key, { ...(d.data as Data) })
    if (base.uretici) { setData(base); setLoading(false) }
    else fetchUretici().then((u) => { setData({ ...base, uretici: u }); setLoading(false) }).catch(() => { setData(base); setLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editDoc.data, editDoc.error])

  // Dil değişimi: fiyat teklifi native (tkS.dil) → veriye de yaz.
  function changeLanguage(lang: 'tr' | 'en') {
    setLanguage(lang)
    setData((d) => (d && typeKey === 'fiyat_teklifi' && d.tkS ? { ...d, tkS: { ...d.tkS, dil: lang } } : d))
  }

  // Canlı önizleme — data/dil değişince debounce ile /preview.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!data || !typeKey) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setPreviewing(true)
      try {
        setPreviewHtml(await fetchPreviewHtml(typeKey, normalizeForRender(typeKey, data), language))
      } catch {
        setPreviewHtml('<div style="padding:24px;font-family:sans-serif;color:#c0392b">Önizleme alınamadı. PDF servisi çalışıyor mu?</div>')
      } finally { setPreviewing(false) }
    }, 350)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [data, language, typeKey])

  /**
   * GÜVENLİK (SAST 1 Eyl 2026 — Kritik): önizleme iframe'i `sandbox` olmadan
   * `srcDoc` kullanıyordu. srcdoc origin'i EBEVEYNDEN MİRAS ALIR, yani PDF
   * servisinden dönen HTML crm.tekstilas.com bağlamında çalışıyor ve
   * localStorage'daki Supabase JWT'sine erişebiliyordu. Belge şablonlarındaki
   * kaçışsız alanlar (rapor.bodyHtml, maliyet.image, tkS.foto) bu yüzden
   * doğrudan oturum çalmaya yükseliyordu.
   *
   * Çözüm: `allow-same-origin` VERİLMEZ → iframe opak origin'e düşer, bizim
   * origin'imize (localStorage/DOM/cookie) erişemez. `allow-scripts` kalır ki
   * yükseklik ölçümü çalışsın; ölçüm artık contentDocument okumasıyla değil,
   * enjekte edilen küçük betiğin postMessage'ıyla yapılır (opak origin'den
   * contentDocument okunamaz). Enjekte edilen CSP ise sandbox içindeki betiğin
   * dışarıya veri sızdırmasını engeller.
   */
  const previewSrcDoc = previewHtml
    ? `<meta http-equiv="Content-Security-Policy" content="connect-src 'none'; form-action 'none'; base-uri 'none'">`
      + previewHtml
      + `<script>(function(){function p(){try{parent.postMessage({__belgeYukseklik:Math.max(
           document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0,400)},'*')}catch(e){}}
           addEventListener('load',p);setTimeout(p,60);setTimeout(p,400);
           if(window.ResizeObserver&&document.body){new ResizeObserver(p).observe(document.body)}})();<\/script>`
    : ''

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      // Opak origin'den gelir (ev.origin === 'null'); yalnız sayı kabul edilir.
      const h = (ev.data as { __belgeYukseklik?: unknown } | null)?.__belgeYukseklik
      if (typeof h === 'number' && Number.isFinite(h) && h > 0) {
        setDocHeight(Math.min(Math.max(h, 400), 20000))
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  async function generate() {
    if (!data || !typeKey) return
    setBusy(true)
    try {
      const r = await gen.mutateAsync({ operationId, typeKey, language, data: normalizeForRender(typeKey, data) })
      toast.success(r.idempotent ? 'Belge zaten üretilmişti — mevcut sürüm indiriliyor.' : 'Belge üretildi.')
      if (r.file_id) {
        const { data: f } = await supabase.from('files').select('storage_path, original_name').eq('id', r.file_id).single()
        if (f) {
          const url = await getSignedUrl('documents', f.storage_path, 60, f.original_name)
          const a = document.createElement('a'); a.href = url; a.download = f.original_name; document.body.appendChild(a); a.click(); a.remove()
        }
      }
      navigate('/belgeler')
    } catch (err) { toast.error(await toUserMessage(err)) } finally { setBusy(false) }
  }

  const title = typeKey ? `${TYPE_LABEL[typeKey]} ${mode === 'edit' ? 'düzenle' : 'hazırla'}` : 'Belge'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Üst çubuk */}
      <header className="flex items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4">
        <Button variant="ghost" size="icon" onClick={cancel} aria-label="Kapat"><X className="size-5" /></Button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {mode === 'edit' ? <FileEdit className="size-4 shrink-0 text-text-muted" /> : <FileText className="size-4 shrink-0 text-text-muted" />}
          <div className="min-w-0">
            <div className="truncate font-semibold leading-tight">{title}</div>
            <div className="text-xs text-text-muted">{operationId != null ? 'Operasyona bağlı' : 'Bağımsız belge'}</div>
          </div>
        </div>
        {/* 1.14 — fiyat teklifinde güncel kur (fiyat girerken kritik) */}
        {typeKey === 'fiyat_teklifi' && <RateBadge className="hidden lg:inline-flex" />}
        {/* Dil seçici */}
        <div className="hidden overflow-hidden rounded-md border border-border sm:inline-flex">
          <button type="button" onClick={() => changeLanguage('tr')} className={cn('px-3 py-1.5 text-sm', language === 'tr' ? 'bg-primary text-primary-foreground' : 'bg-background')}>Türkçe</button>
          <button type="button" onClick={() => changeLanguage('en')} className={cn('inline-flex items-center gap-1 px-3 py-1.5 text-sm', language === 'en' ? 'bg-primary text-primary-foreground' : 'bg-background')}><Globe className="size-3.5" /> English</button>
        </div>
        <Button variant="outline" onClick={cancel} disabled={busy} className="hidden sm:inline-flex">İptal</Button>
        <Button onClick={() => void generate()} disabled={busy || loading || !data || !hasPdfService}
          title={!hasPdfService ? PDF_UNAVAILABLE : undefined}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}<span className="hidden sm:inline"> Üret ve indir</span>
        </Button>
      </header>

      {!hasPdfService && (
        <div className="text-warning-foreground bg-warning flex items-center gap-2 border-b border-border px-4 py-2 text-sm">
          <AlertTriangle className="size-4 shrink-0" /> {PDF_UNAVAILABLE} Formu doldurabilir ve kaydedebilirsiniz; PDF üretimi için belge servisi bağlanmalı.
        </div>
      )}

      {/* Mobil sekme + dil */}
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5 md:hidden">
        <div className="inline-flex overflow-hidden rounded-md border border-border">
          <button type="button" onClick={() => setView('form')} className={cn('px-4 py-1.5 text-sm', view === 'form' ? 'bg-primary text-primary-foreground' : 'bg-background')}>Form</button>
          <button type="button" onClick={() => setView('preview')} className={cn('px-4 py-1.5 text-sm', view === 'preview' ? 'bg-primary text-primary-foreground' : 'bg-background')}>Önizleme</button>
        </div>
        <div className="inline-flex overflow-hidden rounded-md border border-border text-sm">
          <button type="button" onClick={() => changeLanguage('tr')} className={cn('px-2.5 py-1.5', language === 'tr' ? 'bg-primary text-primary-foreground' : 'bg-background')}>TR</button>
          <button type="button" onClick={() => changeLanguage('en')} className={cn('px-2.5 py-1.5', language === 'en' ? 'bg-primary text-primary-foreground' : 'bg-background')}>EN</button>
        </div>
      </div>

      {/* İçerik */}
      <div className="flex min-h-0 flex-1">
        {/* SOL — form */}
        <div className={cn('w-full overflow-y-auto border-r border-border p-4 sm:p-5 md:w-2/5', view !== 'form' && 'hidden md:block')}>
          {loading || !data ? (
            <div className="flex items-center gap-2 text-text-muted"><Loader2 className="size-4 animate-spin" /> Veriler hazırlanıyor…</div>
          ) : (
            typeKey && <EditorForm typeKey={typeKey} data={data} set={setData} />
          )}
        </div>

        {/* SAĞ — canlı önizleme */}
        <div className={cn('flex w-full min-h-0 flex-col bg-muted/40 md:w-3/5', view !== 'preview' && 'hidden md:flex')}>
          <div className="flex items-center justify-between border-b border-border bg-background/60 px-3 py-1.5">
            <span className="text-xs text-text-muted">
              {previewing ? <span className="inline-flex items-center gap-1"><Loader2 className="size-3 animate-spin" /> önizleniyor…</span> : 'Önizleme'}
            </span>
            <div className="inline-flex overflow-hidden rounded-md border border-border text-xs">
              {ZOOMS.map((z) => (
                <button key={z} type="button" onClick={() => setZoom(z)} className={cn('px-2 py-1', zoom === z ? 'bg-primary text-primary-foreground' : 'bg-background')}>
                  %{Math.round(z * 100)}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {previewHtml ? (
              <div style={{ width: PAGE_W * zoom, height: docHeight * zoom, margin: '0 auto' }}>
                <iframe
                  title="Belge önizleme" srcDoc={previewSrcDoc} sandbox="allow-scripts"
                  style={{ width: PAGE_W, height: docHeight, transform: `scale(${zoom})`, transformOrigin: 'top left', border: 0, background: '#fff' }}
                  className="shadow-md"
                />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-text-muted">Önizleme yükleniyor…</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
