import { useMemo, useRef, useState } from 'react'
import { Loader2, ImagePlus, X, UserPlus, Film, Plus } from 'lucide-react'
import { districtsOf } from '@/reference/tr-geo'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toUserMessage } from '@/lib/errors'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { FormField } from '@/components/shared/FormField'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { DatePicker } from '@/components/shared/DatePicker'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useAssigneeOptions } from '@/hooks/useLeads'
import { useCreateCustomer } from '@/hooks/useCustomers'
import { useUploadFile } from '@/hooks/useFiles'
import { useCategoryOptions, useTypeOptions, useCreateCategory } from '@/hooks/useProductCategories'
import { useAllCustomerOptions, useCreateOperation, useChannelOptions, useProvinceOptions, type OperationInput } from '@/hooks/useOperations'
import { useCatalogPickList, type CatalogPick } from '@/hooks/useCatalog'
import { useAddCatalogItem } from '@/hooks/useOperationCatalog'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  presetCustomer?: { id: number; label: string } | null
  onCreated: (operationId: number) => void
}

const PRODUCT_SOURCES = [
  { value: 'gorsel_yukleme', label: 'Görsel yükleme' },
  { value: 'katalogdan_secim', label: 'Katalogdan seçim' },
]
const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function OperationFormDialog({ open, onOpenChange, presetCustomer, onCreated }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Talep oluştur</DialogTitle>
          <DialogDescription>
            Fotoğraf, müşteri ve tür yeter — hızlıca kaydedin. Adet/renk/kumaş gibi detaylar nota yazılır ya da teklifte netleşir.
          </DialogDescription>
        </DialogHeader>
        {open && <OperationForm presetCustomer={presetCustomer} onDone={() => onOpenChange(false)} onCreated={onCreated} />}
      </DialogContent>
    </Dialog>
  )
}

function OperationForm({ presetCustomer, onDone, onCreated }: {
  presetCustomer?: { id: number; label: string } | null
  onDone: () => void
  onCreated: (id: number) => void
}) {
  const { data: me } = useCurrentUser()
  const [customerId, setCustomerId] = useState<number | null>(presetCustomer?.id ?? null)
  const [channelId, setChannelId] = useState<string | null>(null)
  const [provinceId, setProvinceId] = useState<string | null>(null)
  const [district, setDistrict] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [typeId, setTypeId] = useState<string | null>(null)
  const [productSource, setProductSource] = useState<string | null>('gorsel_yukleme')
  const [note, setNote] = useState('')
  const [requestedDate, setRequestedDate] = useState<string | null>(todayISO())
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [newCustOpen, setNewCustOpen] = useState(false)
  const [newType, setNewType] = useState('')
  const [busy, setBusy] = useState(false)
  const [catalogPicks, setCatalogPicks] = useState<CatalogPick[]>([])   // 1.12 — seçilen katalog ürünleri (çoklu)
  const [pickVal, setPickVal] = useState<string | null>(null)

  const pickList = useCatalogPickList()
  const addCatalog = useAddCatalogItem()
  const custOptions = useAllCustomerOptions()
  const channels = useChannelOptions()
  const provinces = useProvinceOptions()
  const districtOpts = useMemo(() => {
    const name = (provinces.data ?? []).find((pr) => String(pr.id) === provinceId)?.name
    return districtsOf(name).map((d) => ({ value: d, label: d }))
  }, [provinces.data, provinceId])
  const categories = useCategoryOptions()
  const types = useTypeOptions(categoryId ? Number(categoryId) : null)
  const owners = useAssigneeOptions()
  const createType = useCreateCategory()
  const create = useCreateOperation()
  const upload = useUploadFile()

  const effectiveOwner = ownerId ?? me?.id ?? null

  async function addType() {
    if (!categoryId || !newType.trim()) return
    try {
      const id = await createType.mutateAsync({ label: newType.trim(), parentId: Number(categoryId) })
      setTypeId(String(id)); setNewType(''); toast.success('Tür eklendi ve seçildi.')
    } catch (err) { toast.error(await toUserMessage(err)) }
  }

  // 1.12 — katalog ürünü ekle; ilk üründe kategori/tür/kompozisyon otomatik dolsun (boşsa).
  function addPick(code: string) {
    const p = pickList.data?.find((x) => x.code === code)
    setPickVal(null)
    if (!p || catalogPicks.some((x) => x.code === code)) return
    setCatalogPicks((s) => [...s, p])
    if (!categoryId && p.category_id) setCategoryId(String(p.category_id))
    if (!typeId && p.type_id) setTypeId(String(p.type_id))
    if (!note.trim() && p.composition) setNote(p.composition)
  }

  async function submit() {
    if (!customerId) { toast.error('Müşteri seçin ya da yeni müşteri ekleyin.'); return }
    if (!channelId) { toast.error('Kanal seçin (raporlar için gerekli).'); return }
    let requestedAt: string | null = null
    if (requestedDate) requestedAt = requestedDate === todayISO() ? new Date().toISOString() : `${requestedDate}T12:00:00`
    const payload: OperationInput = {
      customer_id: customerId,
      channel_id: Number(channelId),
      province_id: provinceId ? Number(provinceId) : null,
      district: district.trim() || null,
      category_id: categoryId ? Number(categoryId) : null,
      type_id: typeId ? Number(typeId) : null,
      product_source: productSource,
      description: note.trim() || null,
      requested_at: requestedAt,
      owner_id: effectiveOwner,
    }
    setBusy(true)
    try {
      const id = await create.mutateAsync(payload)
      for (const file of files) {
        await upload.mutateAsync({
          file, bucket: 'documents',
          category: file.type.startsWith('image/') ? 'image' : 'document',
          entityType: 'operation', entityId: String(id),
        })
      }
      // 1.12 — seçilen katalog ürünlerini operasyona bağla
      for (const p of catalogPicks) {
        try { await addCatalog.mutateAsync({ operation_id: id, catalog_product_code: p.code, label: p.name }) } catch { /* bağlama hatası talebi engellemesin */ }
      }
      toast.success('Talep oluşturuldu.')
      onCreated(id)
      onDone()
    } catch (err) {
      toast.error(await toUserMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <MediaDropzone files={files} onChange={setFiles} />

      {/* Müşteri + yeni */}
      <FormField label="Müşteri" required>
        {(p) => (
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <SearchableSelect
                id={p.id}
                options={
                  presetCustomer && !custOptions.data?.some((o) => o.value === String(presetCustomer.id))
                    ? [{ value: String(presetCustomer.id), label: presetCustomer.label }, ...(custOptions.data ?? [])]
                    : (custOptions.data ?? [])
                }
                value={customerId != null ? String(customerId) : null}
                onChange={(v) => setCustomerId(v ? Number(v) : null)}
                placeholder="Müşteri ara…"
              />
            </div>
            <Button type="button" variant="outline" onClick={() => setNewCustOpen(true)} className="shrink-0">
              <UserPlus className="size-4" /> Yeni
            </Button>
          </div>
        )}
      </FormField>

      {/* Kanal */}
      <FormField label="Kanal" required hint="Talep hangi kanaldan geldi (rapor).">
        {(p) => (
          <SearchableSelect id={p.id} options={(channels.data ?? []).map((c) => ({ value: String(c.id), label: c.label }))}
            value={channelId} onChange={setChannelId} placeholder="WhatsApp, Web sitesi…" />
        )}
      </FormField>

      {/* İl / İlçe — ilçe seçilen ilin adına göre (serbest metne de izin verir) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="İl">
          {(p) => (
            <SearchableSelect id={p.id} clearable options={(provinces.data ?? []).map((pr) => ({ value: String(pr.id), label: pr.name }))}
              value={provinceId} onChange={setProvinceId} placeholder="İl seç…" />
          )}
        </FormField>
        <FormField label="İlçe">
          {(p) => (
            <SearchableSelect id={p.id} clearable allowCustom options={districtOpts}
              value={district || null} onChange={(v) => setDistrict(v ?? '')} placeholder="İlçe seç…" />
          )}
        </FormField>
      </div>

      {/* Kategori → Tür + yeni tür */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Kategori">
          {(p) => (
            <SearchableSelect id={p.id} clearable
              options={(categories.data ?? []).map((c) => ({ value: String(c.id), label: c.label }))}
              value={categoryId} onChange={(v) => { setCategoryId(v); setTypeId(null) }} placeholder="Kadın Üst Giyim…" />
          )}
        </FormField>
        <FormField label="Tür">
          {(p) => (
            <SearchableSelect id={p.id} clearable disabled={!categoryId}
              options={(types.data ?? []).map((t) => ({ value: String(t.id), label: t.label }))}
              value={typeId} onChange={setTypeId} placeholder={categoryId ? 'Bluz…' : 'Önce kategori'} />
          )}
        </FormField>
      </div>
      {categoryId && (
        <div className="flex gap-2">
          <Input value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="Listede yok mu? Yeni tür yaz…" className="h-8"
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void addType())} />
          <Button type="button" size="sm" variant="outline" onClick={() => void addType()} disabled={createType.isPending || !newType.trim()}>
            <Plus className="size-4" /> Ekle
          </Button>
        </div>
      )}

      {/* Ürün geliş türü */}
      <FormField label="Ürün geliş türü">
        {(p) => (
          <SearchableSelect id={p.id} options={PRODUCT_SOURCES} value={productSource} onChange={setProductSource} />
        )}
      </FormField>

      {/* 1.12 — Katalogdan seçim: çoklu ürün; ilk ürün kategori/tür/kompozisyon oto-doldurur */}
      {productSource === 'katalogdan_secim' && (
        <FormField label="Katalog ürünleri">
          {() => (
            <div className="space-y-2">
              <SearchableSelect placeholder="Ürün kodu/adı ara ve ekle…"
                options={(pickList.data ?? []).filter((p) => !catalogPicks.some((x) => x.code === p.code)).map((p) => ({ value: p.code, label: `${p.code} — ${p.name}`, keywords: p.name }))}
                value={pickVal} onChange={(v) => v && addPick(v)} />
              {catalogPicks.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {catalogPicks.map((p) => (
                    <span key={p.code} className="border-border inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
                      <span className="font-mono">{p.code}</span>
                      <button type="button" onClick={() => setCatalogPicks((s) => s.filter((x) => x.code !== p.code))} className="text-text-muted hover:text-danger-foreground"><X className="size-3" /></button>
                    </span>
                  ))}
                </div>
              )}
              <p className="text-text-muted text-xs">Bir talepte birden çok ürün olabilir. İlk seçilen ürün kategori/tür/kompozisyonu otomatik doldurur.</p>
            </div>
          )}
        </FormField>
      )}

      {/* Not */}
      <FormField label="Not">
        {(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} rows={3}
          placeholder="Adet, renk, kumaş, baskı — ne varsa buraya." />}
      </FormField>

      {/* Talep tarihi + Sorumlu */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Talep tarihi" hint="Varsayılan bugün; geçmiş talep girilebilir.">
          {(p) => <DatePicker id={p.id} value={requestedDate} onChange={setRequestedDate} />}
        </FormField>
        <FormField label="Sorumlu">
          {(p) => (
            <SearchableSelect id={p.id} clearable
              options={(owners.data ?? []).map((u) => ({ value: u.id, label: u.full_name }))}
              value={effectiveOwner} onChange={setOwnerId} placeholder="Atanmamış" />
          )}
        </FormField>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={busy}>Vazgeç</Button>
        <Button onClick={() => void submit()} disabled={busy || !customerId || !channelId}>
          {busy && <Loader2 className="size-4 animate-spin" />} Oluştur
        </Button>
      </DialogFooter>

      {newCustOpen && (
        <QuickCustomerDialog onClose={() => setNewCustOpen(false)} onCreated={(id) => { setCustomerId(id); setNewCustOpen(false) }} />
      )}
    </div>
  )
}

function MediaDropzone({ files, onChange }: { files: File[]; onChange: (f: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  function add(list: FileList | null) { if (list) onChange([...files, ...Array.from(list)]) }

  return (
    <div>
      <Label className="text-xs">Fotoğraf / Video</Label>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        className={cn('mt-1 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors',
          drag ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/40')}>
        <ImagePlus className="text-text-muted size-6" />
        <p className="text-text-secondary text-sm">Sürükleyip bırakın ya da seçmek için tıklayın</p>
        <p className="text-text-muted text-xs">Talebin özü görsel — fotoğraf veya video ekleyin</p>
        <input ref={inputRef} type="file" accept="image/*,video/*" multiple className="hidden"
          onChange={(e) => { add(e.target.files); if (inputRef.current) inputRef.current.value = '' }} />
      </div>
      {files.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="border-border bg-muted/40 flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
              {f.type.startsWith('video/') ? <Film className="size-3.5" /> : <ImagePlus className="size-3.5" />}
              <span className="max-w-[140px] truncate">{f.name}</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); onChange(files.filter((_, j) => j !== i)) }}
                className="text-text-muted hover:text-danger-foreground"><X className="size-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function QuickCustomerDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const qc = useQueryClient()
  const createCustomer = useCreateCustomer()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [company, setCompany] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!company.trim() && !fullName.trim()) { toast.error('En az firma ya da kişi adı girin.'); return }
    setBusy(true)
    try {
      const id = await createCustomer.mutateAsync({
        full_name: fullName.trim() || null, company_name: company.trim() || null,
        customer_type_id: null, status_id: null, country: null, city: null, district: null,
        address: null, tax_office: null, tax_number: null, iban: null, bank_name: null, account_holder: null,
        assigned_to: null, next_action_at: null,
      })
      if (phone.trim()) {
        const { data: { user } } = await supabase.auth.getUser()
        await supabase.from('contact_points').insert({
          entity_type: 'customer', entity_id: String(id), type: 'phone',
          value: phone.trim(), is_primary: true, created_by: user?.id ?? null,
        } as never)
      }
      await qc.invalidateQueries({ queryKey: ['all-customer-options'] })
      toast.success('Müşteri eklendi ve seçildi.')
      onCreated(id)
    } catch (err) {
      toast.error(await toUserMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Yeni müşteri</DialogTitle>
          <DialogDescription>Hızlı kayıt — detaylar sonra müşteri kartından tamamlanır.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <FormField label="Firma">
            {(p) => <Input {...p} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="ör. Ada Tekstil A.Ş." />}
          </FormField>
          <FormField label="Kişi adı">
            {(p) => <Input {...p} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="ör. Ayşe Yılmaz" />}
          </FormField>
          <FormField label="Telefon">
            {(p) => <Input {...p} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05xx xxx xx xx" />}
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Vazgeç</Button>
          <Button onClick={() => void save()} disabled={busy || (!company.trim() && !fullName.trim())}>
            {busy && <Loader2 className="size-4 animate-spin" />} Kaydet ve seç
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
