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
import { Separator } from '@/components/ui/separator'
import { useAssigneeOptions } from '@/hooks/useLeads'
import {
  useCustomerStatusOptions,
  useCustomerTypeOptions,
  useCreateCustomer,
  useUpdateCustomer,
  type CustomerDetail,
  type CustomerInput,
} from '@/hooks/useCustomers'
import { DuplicateWarning } from '@/components/search/DuplicateWarning'
import { logDedupOverride } from '@/hooks/useSearch'
import { useAddContactPoint } from '@/hooks/useContactPoints'
import { useChannelOptions } from '@/hooks/useInteractions'

// Statik konum seçenekleri (aranabilir dropdown; serbest metne de izin verilir).
const COUNTRY_OPTS = COUNTRIES.map((c) => ({ value: c, label: c }))
const PROVINCE_OPTS = TR_PROVINCE_NAMES.map((c) => ({ value: c, label: c }))

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing?: CustomerDetail | null
  onCreated?: (id: number) => void
}

export function CustomerFormDialog({ open, onOpenChange, editing, onCreated }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Müşteriyi düzenle' : 'Müşteri ekle'}</DialogTitle>
        </DialogHeader>
        {open && (
          <CustomerForm
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
  customer_type_id: string | null
  status_id: string | null
  country: string
  city: string
  district: string
  address: string
  tax_office: string
  tax_number: string
  iban: string
  bank_name: string
  account_holder: string
  assigned_to: string | null
  first_contact_channel_id: string | null
  first_contact_date: string // date (YYYY-MM-DD) ya da ''
  next_action_at: string
  phone: string
  email: string
}

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function CustomerForm({
  editing,
  onDone,
  onCreated,
}: {
  editing: CustomerDetail | null
  onDone: () => void
  onCreated?: (id: number) => void
}) {
  const isEdit = !!editing
  const [form, setForm] = useState<FormState>(() => ({
    full_name: editing?.full_name ?? '',
    company_name: editing?.company_name ?? '',
    customer_type_id: editing?.customer_type_id != null ? String(editing.customer_type_id) : null,
    status_id: editing?.status_id != null ? String(editing.status_id) : null,
    country: editing?.country ?? 'Türkiye',
    city: editing?.city ?? '',
    district: editing?.district ?? '',
    address: editing?.address ?? '',
    tax_office: editing?.tax_office ?? '',
    tax_number: editing?.tax_number ?? '',
    iban: editing?.iban ?? '',
    bank_name: editing?.bank_name ?? '',
    account_holder: editing?.account_holder ?? '',
    assigned_to: editing?.assigned_to ?? null,
    first_contact_channel_id:
      editing?.first_contact_channel_id != null ? String(editing.first_contact_channel_id) : null,
    first_contact_date: editing?.first_contact_date ?? '',
    next_action_at: toLocalInput(editing?.next_action_at ?? null),
    phone: '',
    email: '',
  }))
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  const statuses = useCustomerStatusOptions()
  const types = useCustomerTypeOptions()
  const channels = useChannelOptions()
  const assignees = useAssigneeOptions()
  const [maxDate] = useState(() => new Date().toISOString().slice(0, 10)) // ilk temas gelecekte olamaz
  const create = useCreateCustomer()
  const update = useUpdateCustomer()
  const addContact = useAddContactPoint()
  const pending = create.isPending || update.isPending

  const clean = (s: string) => s.trim() || null

  async function handleSubmit() {
    const full_name = clean(form.full_name)
    const company_name = clean(form.company_name)
    if (!full_name && !company_name) {
      toast.error('Kişi adı veya firma adından en az biri dolu olmalı.')
      return
    }
    const payload: CustomerInput = {
      full_name,
      company_name,
      customer_type_id: form.customer_type_id ? Number(form.customer_type_id) : null,
      status_id: form.status_id ? Number(form.status_id) : null,
      country: clean(form.country),
      city: clean(form.city),
      district: clean(form.district),
      address: clean(form.address),
      tax_office: clean(form.tax_office),
      tax_number: clean(form.tax_number),
      iban: clean(form.iban),
      bank_name: clean(form.bank_name),
      account_holder: clean(form.account_holder),
      assigned_to: form.assigned_to,
      first_contact_channel_id: form.first_contact_channel_id ? Number(form.first_contact_channel_id) : null,
      first_contact_date: form.first_contact_date || null,
      next_action_at: form.next_action_at ? new Date(form.next_action_at).toISOString() : null,
    }
    try {
      if (isEdit) {
        await update.mutateAsync({ id: editing.id, ...payload })
        toast.success('Müşteri güncellendi.')
      } else {
        const id = await create.mutateAsync(payload)
        const phone = form.phone.trim()
        const email = form.email.trim()
        if (phone) await addContact.mutateAsync({ entity_type: 'customer', entity_id: id, type: 'phone', value: phone, is_primary: true })
        if (email) await addContact.mutateAsync({ entity_type: 'customer', entity_id: id, type: 'email', value: email })
        await logDedupOverride('customer', id, company_name, phone || null, payload.tax_number)
        toast.success('Müşteri oluşturuldu.')
        onCreated?.(id)
      }
      onDone()
    } catch (err) {
      toast.error(await toUserMessage(err))
    }
  }

  const opts = (arr: { id: number; label: string }[] | undefined) =>
    (arr ?? []).map((s) => ({ value: String(s.id), label: s.label }))
  const districtOpts = useMemo(
    () => districtsOf(form.city).map((d) => ({ value: d, label: d })),
    [form.city],
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Kişi adı" hint="Firma adı doluysa boş bırakılabilir.">
          {(p) => <Input {...p} value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />}
        </FormField>
        <FormField label="Firma adı">
          {(p) => (
            <Input {...p} value={form.company_name} onChange={(e) => set('company_name', e.target.value)} />
          )}
        </FormField>
        <FormField label="Tür">
          {(p) => (
            <SearchableSelect
              id={p.id}
              options={opts(types.data)}
              value={form.customer_type_id}
              onChange={(v) => set('customer_type_id', v)}
              placeholder="Tür seç"
              clearable
            />
          )}
        </FormField>
        <FormField label="Durum" hint={isEdit ? undefined : 'Boş bırakılırsa varsayılan (Aktif) atanır.'}>
          {(p) => (
            <SearchableSelect
              id={p.id}
              options={opts(statuses.data)}
              value={form.status_id}
              onChange={(v) => set('status_id', v)}
              placeholder="Durum seç"
              clearable={!isEdit}
            />
          )}
        </FormField>
        <FormField label="Atanan">
          {(p) => (
            <SearchableSelect
              id={p.id}
              options={(assignees.data ?? []).map((u) => ({ value: u.id, label: u.full_name }))}
              value={form.assigned_to}
              onChange={(v) => set('assigned_to', v)}
              placeholder="Atanmamış"
              clearable
            />
          )}
        </FormField>
        <FormField label="İlk temas kanalı">
          {(p) => (
            <SearchableSelect
              id={p.id}
              options={opts(channels.data)}
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
        taxNumber={form.tax_number}
        excludeType="customer"
        excludeId={editing?.id ?? null}
      />

      <FormField label="Adres">
        {(p) => <Textarea {...p} value={form.address} onChange={(e) => set('address', e.target.value)} />}
      </FormField>

      <div className="space-y-2">
        <Separator />
        <p className="text-text-muted text-xs font-medium uppercase">Ticari bilgiler (opsiyonel)</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Vergi dairesi">
          {(p) => <Input {...p} value={form.tax_office} onChange={(e) => set('tax_office', e.target.value)} />}
        </FormField>
        <FormField label="Vergi numarası">
          {(p) => <Input {...p} value={form.tax_number} onChange={(e) => set('tax_number', e.target.value)} />}
        </FormField>
        <FormField label="IBAN" className="sm:col-span-2">
          {(p) => <Input {...p} value={form.iban} onChange={(e) => set('iban', e.target.value)} />}
        </FormField>
        <FormField label="Banka">
          {(p) => <Input {...p} value={form.bank_name} onChange={(e) => set('bank_name', e.target.value)} />}
        </FormField>
        <FormField label="Hesap sahibi">
          {(p) => (
            <Input {...p} value={form.account_holder} onChange={(e) => set('account_holder', e.target.value)} />
          )}
        </FormField>
      </div>

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
