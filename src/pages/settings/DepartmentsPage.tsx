import { useState } from 'react'
import { Plus, MoreHorizontal, Pencil, Power, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { FormField } from '@/components/shared/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDepartments, useSaveDepartment, useSetDepartmentActive, type Department } from '@/hooks/useOrg'

export function DepartmentsPage() {
  const { data, isLoading } = useDepartments()
  const setActive = useSetDepartmentActive()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Department | null>(null)
  const [toggleTarget, setToggleTarget] = useState<Department | null>(null)

  const columns: DataTableColumn<Department>[] = [
    {
      key: 'name',
      header: 'Departman',
      cell: (d) => (
        <div>
          <div className="text-sm font-medium text-foreground">{d.name}</div>
          <div className="text-text-secondary text-xs">{d.code}</div>
        </div>
      ),
    },
    { key: 'description', header: 'Açıklama', hideable: true, cell: (d) => d.description ?? '—' },
    { key: 'sort', header: 'Sıra', align: 'center', hideable: true, cell: (d) => d.sort_order },
    { key: 'status', header: 'Durum', cell: (d) => <StatusBadge status={d.is_active ? 'active' : 'inactive'} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (d) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => (setEditing(d), setFormOpen(true))}>
              <Pencil className="size-4" /> Düzenle
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setToggleTarget(d)}>
              <Power className="size-4" /> {d.is_active ? 'Pasifleştir' : 'Aktifleştir'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Departmanlar"
        description="Departmanları tanımlayın. Silme yok; pasifleştirilebilir."
        action={
          <Button onClick={() => (setEditing(null), setFormOpen(true))}>
            <Plus className="size-4" /> Departman ekle
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={data ?? []}
        rowKey={(d) => String(d.id)}
        loading={isLoading}
        page={1}
        pageSize={100}
        total={data?.length ?? 0}
        onPageChange={() => {}}
        emptyState={
          <EmptyState
            title="Departman yok"
            description="İlk departmanı ekleyin (çalışan formunda seçilebilir olur)."
            action={
              <Button variant="outline" onClick={() => (setEditing(null), setFormOpen(true))}>
                Departman ekle
              </Button>
            }
          />
        }
      />

      <DepartmentFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} />

      <ConfirmDialog
        open={!!toggleTarget}
        onOpenChange={(o) => !o && setToggleTarget(null)}
        title={toggleTarget?.is_active ? 'Departmanı pasifleştir' : 'Departmanı aktifleştir'}
        description={
          toggleTarget?.is_active
            ? `${toggleTarget?.name} pasifleştirilecek; yeni çalışan formlarında görünmeyecek. Mevcut atamalar korunur.`
            : `${toggleTarget?.name} yeniden aktifleştirilecek.`
        }
        confirmLabel={toggleTarget?.is_active ? 'Pasifleştir' : 'Aktifleştir'}
        destructive={toggleTarget?.is_active}
        onConfirm={async () => {
          if (!toggleTarget) return
          try {
            await setActive.mutateAsync({ id: toggleTarget.id, is_active: !toggleTarget.is_active })
            toast.success('İşlem tamamlandı.')
            setToggleTarget(null)
          } catch (err) {
            toast.error((err as Error).message)
          }
        }}
      />
    </div>
  )
}

function DepartmentFormDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: Department | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Departmanı düzenle' : 'Departman ekle'}</DialogTitle>
        </DialogHeader>
        {open && <DepartmentForm key={editing?.id ?? 'new'} editing={editing} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function DepartmentForm({ editing, onDone }: { editing: Department | null; onDone: () => void }) {
  const [name, setName] = useState(editing?.name ?? '')
  const [code, setCode] = useState(editing?.code ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [sortOrder, setSortOrder] = useState(String(editing?.sort_order ?? 0))
  const [active, setActive] = useState(editing?.is_active ?? true)
  const save = useSaveDepartment()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await save.mutateAsync({
        id: editing?.id,
        name: name.trim(),
        code: code.trim().toUpperCase(),
        description: description.trim() || null,
        sort_order: Number(sortOrder) || 0,
        is_active: active,
      })
      toast.success(editing ? 'Departman güncellendi.' : 'Departman eklendi.')
      onDone()
    } catch (err) {
      const msg = (err as { code?: string }).code === '23505' ? 'Bu kod zaten kullanılıyor.' : (err as Error).message
      toast.error(msg)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormField label="Ad" required>
        {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} required />}
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Kod" required hint="Benzersiz (ör. SATIS)">
          {(p) => <Input {...p} value={code} onChange={(e) => setCode(e.target.value)} required />}
        </FormField>
        <FormField label="Sıra" hint="Listeleme sırası">
          {(p) => <Input {...p} type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />}
        </FormField>
      </div>
      <FormField label="Açıklama">
        {(p) => <Input {...p} value={description} onChange={(e) => setDescription(e.target.value)} />}
      </FormField>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={active} onCheckedChange={(c) => setActive(!!c)} /> Aktif
      </label>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={save.isPending}>
          Vazgeç
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          {editing ? 'Kaydet' : 'Ekle'}
        </Button>
      </DialogFooter>
    </form>
  )
}
