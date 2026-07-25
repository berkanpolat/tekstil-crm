import { useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  useRoleOptions,
  useDepartmentOptions,
  usePositionOptions,
  useCreateStaff,
  useUpdateStaff,
  type StaffRow,
} from '@/hooks/useStaff'

interface StaffFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Düzenleme için mevcut satır; yoksa yeni oluşturma. */
  editing?: StaffRow | null
}

export function StaffFormDialog({ open, onOpenChange, editing }: StaffFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Çalışanı düzenle' : 'Çalışan ekle'}</DialogTitle>
        </DialogHeader>
        {/* key: editing değişince form durumu yeniden başlar (effect gerekmez). */}
        {open && (
          <StaffForm key={editing?.id ?? 'new'} editing={editing ?? null} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

interface FormState {
  email: string
  password: string
  full_name: string
  phone: string
  role_id: string | null
  department_id: string | null
  position_id: string | null
}

function StaffForm({ editing, onDone }: { editing: StaffRow | null; onDone: () => void }) {
  const isEdit = !!editing
  const [form, setForm] = useState<FormState>(() => ({
    email: editing?.email ?? '',
    password: '',
    full_name: editing?.full_name ?? '',
    phone: editing?.phone ?? '',
    role_id: null,
    department_id: null,
    position_id: null,
  }))

  const roles = useRoleOptions()
  const departments = useDepartmentOptions()
  const positions = usePositionOptions(form.department_id ? Number(form.department_id) : null)
  const create = useCreateStaff()
  const update = useUpdateStaff()
  const busy = create.isPending || update.isPending

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      if (isEdit && editing) {
        await update.mutateAsync({
          id: editing.id,
          full_name: form.full_name.trim(),
          phone: form.phone.trim() || null,
          department_id: form.department_id ? Number(form.department_id) : null,
          position_id: form.position_id ? Number(form.position_id) : null,
          role_id: form.role_id ? Number(form.role_id) : null,
        })
        toast.success('Çalışan güncellendi.')
      } else {
        if (form.password.length < 8) {
          toast.error('Şifre en az 8 karakter olmalı.')
          return
        }
        await create.mutateAsync({
          email: form.email.trim(),
          password: form.password,
          full_name: form.full_name.trim(),
          phone: form.phone.trim() || null,
          department_id: form.department_id ? Number(form.department_id) : null,
          position_id: form.position_id ? Number(form.position_id) : null,
          role_id: form.role_id ? Number(form.role_id) : null,
        })
        toast.success('Çalışan eklendi.')
      }
      onDone()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormField label="Ad soyad" required>
        {(p) => <Input {...p} value={form.full_name} onChange={(e) => set('full_name', e.target.value)} required />}
      </FormField>

      <FormField label="E-posta" required hint={isEdit ? 'E-posta değiştirilemez.' : undefined}>
        {(p) => (
          <Input
            {...p}
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            disabled={isEdit}
            required
          />
        )}
      </FormField>

      {!isEdit && (
        <FormField label="Geçici şifre" required hint="Çalışan ilk girişte değiştirecek (en az 8 karakter).">
          {(p) => (
            <Input {...p} type="text" value={form.password} onChange={(e) => set('password', e.target.value)} required />
          )}
        </FormField>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Rol">
          {(p) => (
            <SearchableSelect
              id={p.id}
              options={(roles.data ?? []).map((r) => ({ value: String(r.id), label: r.name }))}
              value={form.role_id}
              onChange={(v) => set('role_id', v)}
              placeholder="Rol seçin"
              clearable
            />
          )}
        </FormField>
        <FormField label="Telefon">
          {(p) => <Input {...p} value={form.phone} onChange={(e) => set('phone', e.target.value)} />}
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Departman">
          {(p) => (
            <SearchableSelect
              id={p.id}
              options={(departments.data ?? []).map((d) => ({ value: String(d.id), label: d.name }))}
              value={form.department_id}
              onChange={(v) => {
                set('department_id', v)
                set('position_id', null)
              }}
              placeholder="Departman seçin"
              clearable
            />
          )}
        </FormField>
        <FormField label="Pozisyon">
          {(p) => (
            <SearchableSelect
              id={p.id}
              options={(positions.data ?? []).map((pos) => ({ value: String(pos.id), label: pos.name }))}
              value={form.position_id}
              onChange={(v) => set('position_id', v)}
              placeholder="Pozisyon seçin"
              clearable
            />
          )}
        </FormField>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={onDone}>
          Vazgeç
        </Button>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {isEdit ? 'Kaydet' : 'Çalışan ekle'}
        </Button>
      </DialogFooter>
    </form>
  )
}
