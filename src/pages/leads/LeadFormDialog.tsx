import { useMemo, useState } from 'react'
import { toUserMessage } from '@/lib/errors'
import { COUNTRIES } from '@/reference/countries'
import { TR_PROVINCE_NAMES, districtsOf } from '@/reference/tr-geo'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FormField } from '@/components/shared/FormField'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { PhoneInput } from '@/components/shared/PhoneInput'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  useLeadStatusOptions,
  useLeadSourceOptions,
  useAssigneeOptions,
  useCreateLead,
  useUpdateLead,
  type LeadDetail,
  type LeadInput,
} from '@/hooks/useLeads'
import { DuplicateWarning } from '@/components/search/DuplicateWarning'
import { logDedupOverride } from '@/hooks/useSearch'
import { useAddContactPoint } from '@/hooks/useContactPoints'
import { useChannelOptions } from '@/hooks/useInteractions'

// Statik konum seçenekleri (aranabilir dropdown; serbest metne de izin verilir).
const COUNTRY_OPTS = COUNTRIES.map((c) => ({ value: c, label: c }))
const PROVINCE_OPTS = TR_PROVINCE_NAMES.map((c) => ({ value: c, label: c }))

interface LeadFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Düzenleme için mevcut kayıt; yoksa yeni. */
  editing?: LeadDetail | null
  /** Oluşturma sonrası yeni id (ör. karta yönlendirme). */
  onCreated?: (id: number) => void
}

export function LeadFormDialog({ open, onOpenChange, editing, onCreated }: LeadFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Potansiyeli düzenle' : 'Potansiyel ekle'}</DialogTitle>
        </DialogHeader>
        {open && (
          <LeadForm
            key={editing?.id ?? 'new'}
            editing={editing ?? null}
            onDone={() => onOpenChange(false)}
            onCreated={onCreated}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

interface FormState {
  full_name: string
  company_name: string
  country: string
  city: string
  district: string
  address: string
  status_id: string | null
  source_id: string | null
  first_contact_channel_id: string | null
  first_contact_date: string // date (YYYY-MM-DD) ya da ''
  assigned_to: string | null
  next_action_at: string // datetime-local (YYYY-MM-DDTHH:mm) ya da ''
  phone: string // yalnız oluşturmada; iletişim noktası olur + mükerrer sinyali
  email: string
}

// ISO → datetime-local input değeri (yerel saat).
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function LeadForm({
  editing,
  onDone,
  onCreated,
}: {
  editing: LeadDetail | null
  onDone: () => void
  onCreated?: (id: number) => void
}) {
  const isEdit = !!editing
  const [form, setForm] = useState<FormState>(() => ({
    full_name: editing?.full_name ?? '',
    company_name: editing?.company_name ?? '',
    country: editing?.country ?? 'Türkiye',
    city: editing?.city ?? '',
    district: editing?.district ?? '',
    address: editing?.address ?? '',
    status_id: editing?.status_id != null ? String(editing.status_id) : null,
    source_id: editing?.source_id != null ? String(editing.source_id) : null,
    first_contact_channel_id:
      editing?.first_contact_channel_id != null ? String(editing.first_contact_channel_id) : null,
    first_contact_date: editing?.first_contact_date ?? '',
    assigned_to: editing?.assigned_to ?? null,
    next_action_at: toLocalInput(editing?.next_action_at ?? null),
    phone: '',
    email: '',
  }))
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  const statuses = useLeadStatusOptions()
  const sources = useLeadSourceOptions()
  const channels = useChannelOptions()
  const assignees = useAssigneeOptions()
  const create = useCreateLead()
  const update = useUpdateLead()
  const addContact = useAddContactPoint()
  const pending = create.isPending || update.isPending

  async function handleSubmit() {
    const full_name = form.full_name.trim() || null
    const company_name = form.company_name.trim() || null
    // CHECK aynası: firma veya kişiden en az biri dolu olmalı.
    if (!full_name && !company_name) {
      toast.error('Kişi adı veya firma adından en az biri dolu olmalı.')
      return
    }
    const payload: LeadInput = {
      full_name,
      company_name,
      country: form.country.trim() || null,
      city: form.city.trim() || null,
      district: form.district.trim() || null,
      address: form.address.trim() || null,
      source_id: form.source_id ? Number(form.source_id) : null,
      // status_id null → DB trigger varsayılan durumu atar
      status_id: form.status_id ? Number(form.status_id) : null,
      first_contact_channel_id: form.first_contact_channel_id ? Number(form.first_contact_channel_id) : null,
      first_contact_date: form.first_contact_date || null,
      assigned_to: form.assigned_to,
      next_action_at: form.next_action_at ? new Date(form.next_action_at).toISOString() : null,
    }
    try {
      if (isEdit) {
        await update.mutateAsync({ id: editing.id, ...payload })
        toast.success('Potansiyel güncellendi.')
      } else {
        const id = await create.mutateAsync(payload)
        // Telefon/e-posta → iletişim noktası (oluşturmada girildiyse).
        const phone = form.phone.trim()
        const email = form.email.trim()
        if (phone) await addContact.mutateAsync({ entity_type: 'lead', entity_id: id, type: 'phone', value: phone, is_primary: true })
        if (email) await addContact.mutateAsync({ entity_type: 'lead', entity_id: id, type: 'email', value: email })
        // Mükerrer eşiği izleme: uyarı varsa (kullanıcı devam etti) event_log'a yaz.
        await logDedupOverride('lead', id, company_name, phone || null, null)
        toast.success('Potansiyel oluşturuldu.')
        onCreated?.(id)
      }
      onDone()
    } catch (err) {
      toast.error(await toUserMessage(err))
    }
  }

  const statusOpts = (statuses.data ?? []).map((s) => ({ value: String(s.id), label: s.label }))
  const sourceOpts = (sources.data ?? []).map((s) => ({ value: String(s.id), label: s.label }))
  const channelOpts = (channels.data ?? []).map((c) => ({ value: String(c.id), label: c.label }))
  const assigneeOpts = (assignees.data ?? []).map((u) => ({ value: u.id, label: u.full_name }))
  const [maxDate] = useState(() => new Date().toISOString().slice(0, 10)) // ilk temas gelecekte olamaz
  const districtOpts = useMemo(
    () => districtsOf(form.city).map((d) => ({ value: d, label: d })),
    [form.city],
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Kişi adı" hint="Firma adı doluysa boş bırakılabilir.">
          {(p) => (
            <Input {...p} value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
          )}
        </FormField>
        <FormField label="Firma adı">
          {(p) => (
            <Input {...p} value={form.company_name} onChange={(e) => set('company_name', e.target.value)} />
          )}
        </FormField>
        <FormField label="Durum" hint={isEdit ? undefined : 'Boş bırakılırsa varsayılan atanır.'}>
          {() => (
            <SearchableSelect
              options={statusOpts}
              value={form.status_id}
              onChange={(v) => set('status_id', v)}
              placeholder="Durum seç"
              clearable={!isEdit}
            />
          )}
        </FormField>
        <FormField label="Kaynak">
          {() => (
            <SearchableSelect
              options={sourceOpts}
              value={form.source_id}
              onChange={(v) => set('source_id', v)}
              placeholder="Kaynak seç"
              clearable
            />
          )}
        </FormField>
        <FormField label="İlk temas kanalı">
          {() => (
            <SearchableSelect
              options={channelOpts}
              value={form.first_contact_channel_id}
              onChange={(v) => set('first_contact_channel_id', v)}
              placeholder="Kanal seç"
              clearable
            />
          )}
        </FormField>
        <FormField label="İlk temas tarihi">
          {(p) => (
            <Input
              {...p}
              type="date"
              max={maxDate}
              value={form.first_contact_date}
              onChange={(e) => set('first_contact_date', e.target.value)}
            />
          )}
        </FormField>
        <FormField label="Atanan">
          {() => (
            <SearchableSelect
              options={assigneeOpts}
              value={form.assigned_to}
              onChange={(v) => set('assigned_to', v)}
              placeholder="Atanmamış"
              clearable
            />
          )}
        </FormField>
        <FormField label="Ülke">
          {(p) => (
            <SearchableSelect
              id={p.id}
              options={COUNTRY_OPTS}
              value={form.country || null}
              onChange={(v) => set('country', v ?? '')}
              placeholder="Ülke seç"
              allowCustom
              clearable
            />
          )}
        </FormField>
        <FormField label="Şehir">
          {(p) => (
            <SearchableSelect
              id={p.id}
              options={PROVINCE_OPTS}
              value={form.city || null}
              onChange={(v) => {
                set('city', v ?? '')
                set('district', '') // il değişince ilçe sıfırlanır
              }}
              placeholder="İl seç"
              allowCustom
              clearable
            />
          )}
        </FormField>
        <FormField label="İlçe">
          {(p) => (
            <SearchableSelect
              id={p.id}
              options={districtOpts}
              value={form.district || null}
              onChange={(v) => set('district', v ?? '')}
              placeholder="İlçe seç"
              allowCustom
              clearable
            />
          )}
        </FormField>
        <FormField label="Sonraki aksiyon">
          {(p) => (
            <Input
              {...p}
              type="datetime-local"
              value={form.next_action_at}
              onChange={(e) => set('next_action_at', e.target.value)}
            />
          )}
        </FormField>
        {!isEdit && (
          <>
            <FormField label="Telefon" hint="İletişim noktası olur; mükerrer kontrol edilir.">
              {(p) => <PhoneInput id={p.id} value={form.phone} onChange={(v) => set('phone', v)} />}
            </FormField>
            <FormField label="E-posta">
              {(p) => <Input {...p} value={form.email} onChange={(e) => set('email', e.target.value)} />}
            </FormField>
          </>
        )}
      </div>

      <DuplicateWarning
        company={form.company_name}
        phone={form.phone}
        excludeType="lead"
        excludeId={editing?.id ?? null}
      />

      <FormField label="Adres">
        {(p) => <Textarea {...p} value={form.address} onChange={(e) => set('address', e.target.value)} />}
      </FormField>

      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={pending}>
          Vazgeç
        </Button>
        <Button onClick={() => void handleSubmit()} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {isEdit ? 'Kaydet' : 'Oluştur'}
        </Button>
      </DialogFooter>
    </div>
  )
}
