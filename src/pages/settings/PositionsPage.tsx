import { useState } from 'react'
import { toUserMessage } from '@/lib/errors'
import { Plus, MoreHorizontal, Pencil, Power, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { FormField } from '@/components/shared/FormField'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
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
import { usePositions, useSavePosition, useSetPositionActive, type Position } from '@/hooks/useOrg'
import { useDepartmentOptions } from '@/hooks/useStaff'

export function PositionsPage() {
  const { data, isLoading } = usePositions()
  const setActive = useSetPositionActive()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Position | null>(null)
  const [toggleTarget, setToggleTarget] = useState<Position | null>(null)

  const columns: DataTableColumn<Position>[] = [
    {
      key: 'name',
      header: 'Pozisyon',
      cell: (p) => (
        <div>
          <div className="text-sm font-medium text-foreground">{p.name}</div>
          <div className="text-text-secondary text-xs">{p.code}</div>
        </div>
      ),
    },
    {
      key: 'department',
      header: 'Departman',
      cell: (p) =>
        p.department_name ?? <span className="text-info-foreground bg-info rounded px-1.5 py-0.5 text-xs">Global</span>,
    },
    { key: 'status', header: 'Durum', cell: (p) => <StatusBadge status={p.is_active ? 'active' : 'inactive'} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (p) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => (setEditing(p), setFormOpen(true))}>
              <Pencil className="size-4" /> Düzenle
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setToggleTarget(p)}>
              <Power className="size-4" /> {p.is_active ? 'Pasifleştir' : 'Aktifleştir'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pozisyonlar"
        description="Pozisyonları tanımlayın. Departman boş bırakılırsa global olur; aynı kod farklı departmanlarda kullanılabilir."
        action={
          <Button onClick={() => (setEditing(null), setFormOpen(true))}>
            <Plus className="size-4" /> Pozisyon ekle
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={data ?? []}
        rowKey={(p) => String(p.id)}
        loading={isLoading}
        page={1}
        pageSize={100}
        total={data?.length ?? 0}
        onPageChange={() => {}}
        emptyState={
          <EmptyState
            title="Pozisyon yok"
            description="İlk pozisyonu ekleyin."
            action={
              <Button variant="outline" onClick={() => (setEditing(null), setFormOpen(true))}>
                Pozisyon ekle
              </Button>
            }
          />
        }
      />

      <PositionFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} />

      <ConfirmDialog
        open={!!toggleTarget}
        onOpenChange={(o) => !o && setToggleTarget(null)}
        title={toggleTarget?.is_active ? 'Pozisyonu pasifleştir' : 'Pozisyonu aktifleştir'}
        description={
          toggleTarget?.is_active
            ? `${toggleTarget?.name} pasifleştirilecek; yeni çalışan formlarında görünmeyecek.`
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
            toast.error(await toUserMessage(err))
          }
        }}
      />
    </div>
  )
}

function PositionFormDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: Position | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Pozisyonu düzenle' : 'Pozisyon ekle'}</DialogTitle>
        </DialogHeader>
        {open && <PositionForm key={editing?.id ?? 'new'} editing={editing} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function PositionForm({ editing, onDone }: { editing: Position | null; onDone: () => void }) {
  const [name, setName] = useState(editing?.name ?? '')
  const [code, setCode] = useState(editing?.code ?? '')
  const [departmentId, setDepartmentId] = useState<string | null>(
    editing?.department_id ? String(editing.department_id) : null,
  )
  const [active, setActive] = useState(editing?.is_active ?? true)
  const departments = useDepartmentOptions()
  const save = useSavePosition()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await save.mutateAsync({
        id: editing?.id,
        name: name.trim(),
        code: code.trim().toUpperCase(),
        department_id: departmentId ? Number(departmentId) : null,
        is_active: active,
      })
      toast.success(editing ? 'Pozisyon güncellendi.' : 'Pozisyon eklendi.')
      onDone()
    } catch (err) {
      toast.error(await toUserMessage(err))
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormField label="Ad" required>
        {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} required />}
      </FormField>
      <FormField label="Kod" required hint="Departman içinde benzersiz (global ise global düzlemde).">
        {(p) => <Input {...p} value={code} onChange={(e) => setCode(e.target.value)} required />}
      </FormField>
      <FormField label="Departman" hint="Boş = global pozisyon (tüm departmanlarda).">
        {(p) => (
          <SearchableSelect
            id={p.id}
            options={(departments.data ?? []).map((d) => ({ value: String(d.id), label: d.name }))}
            value={departmentId}
            onChange={setDepartmentId}
            placeholder="Global (departmansız)"
            clearable
          />
        )}
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
