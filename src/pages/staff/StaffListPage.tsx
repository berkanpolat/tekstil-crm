import { useState } from 'react'
import { toUserMessage } from '@/lib/errors'
import { UserPlus, MoreHorizontal, Pencil, KeyRound, UserX, UserCheck, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { DataTable, type DataTableColumn, type SortState } from '@/components/shared/DataTable'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { FormField } from '@/components/shared/FormField'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import {
  useStaffList,
  useDepartmentOptions,
  useSetStaffActive,
  useResetStaffPassword,
  type StaffRow,
} from '@/hooks/useStaff'
import { StaffFormDialog } from './StaffFormDialog'

export function StaffListPage() {
  const { data: me } = useCurrentUser()
  const canManage = me?.role_key === 'owner' || me?.role_key === 'admin'

  const [search, setSearch] = useState('')
  const [departmentId, setDepartmentId] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sort, setSort] = useState<SortState | null>({ key: 'full_name', dir: 'asc' })

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<StaffRow | null>(null)
  const [activeTarget, setActiveTarget] = useState<StaffRow | null>(null)
  const [resetTarget, setResetTarget] = useState<StaffRow | null>(null)

  const departments = useDepartmentOptions()
  const setActive = useSetStaffActive()

  const filters = {
    search: search || undefined,
    departmentId: departmentId ? Number(departmentId) : null,
    status: (status as 'active' | 'inactive' | null) ?? null,
    page,
    pageSize,
    sort,
  }
  const { data, isLoading } = useStaffList(filters)
  const hasFilters = !!search || !!departmentId || !!status

  const columns: DataTableColumn<StaffRow>[] = [
    {
      key: 'full_name',
      header: 'Çalışan',
      sortable: true,
      cell: (r) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{r.full_name}</div>
          <div className="text-text-secondary truncate text-xs">{r.email}</div>
        </div>
      ),
    },
    { key: 'department', header: 'Departman', hideable: true, cell: (r) => r.department_name ?? '—' },
    { key: 'position', header: 'Pozisyon', hideable: true, cell: (r) => r.position_name ?? '—' },
    { key: 'role', header: 'Rol', cell: (r) => r.role_name ?? '—' },
    { key: 'status', header: 'Durum', cell: (r) => <StatusBadge status={r.is_active ? 'active' : 'inactive'} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (r) =>
        canManage ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem
                onSelect={() => {
                  setEditing(r)
                  setFormOpen(true)
                }}
              >
                <Pencil className="size-4" /> Düzenle
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setResetTarget(r)}>
                <KeyRound className="size-4" /> Şifre sıfırla
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setActiveTarget(r)}>
                {r.is_active ? (
                  <>
                    <UserX className="size-4" /> Pasifleştir
                  </>
                ) : (
                  <>
                    <UserCheck className="size-4" /> Aktifleştir
                  </>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null,
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Çalışanlar"
        description="Sistemdeki çalışanları görüntüleyin ve yönetin."
        action={
          canManage ? (
            <Button
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <UserPlus className="size-4" /> Çalışan ekle
            </Button>
          ) : undefined
        }
      />

      <FilterBar
        search={search}
        onSearchChange={(v) => {
          setSearch(v)
          setPage(1)
        }}
        searchPlaceholder="Ad veya e-posta ara…"
        showClear={hasFilters}
        onClear={() => {
          setSearch('')
          setDepartmentId(null)
          setStatus(null)
          setPage(1)
        }}
      >
        <SearchableSelect
          options={(departments.data ?? []).map((d) => ({ value: String(d.id), label: d.name }))}
          value={departmentId}
          onChange={(v) => {
            setDepartmentId(v)
            setPage(1)
          }}
          placeholder="Departman"
          clearable
          className="w-44"
        />
        <SearchableSelect
          options={[
            { value: 'active', label: 'Aktif' },
            { value: 'inactive', label: 'Pasif' },
          ]}
          value={status}
          onChange={(v) => {
            setStatus(v)
            setPage(1)
          }}
          placeholder="Durum"
          clearable
          className="w-36"
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={data?.rows ?? []}
        rowKey={(r) => r.id}
        loading={isLoading}
        page={page}
        pageSize={pageSize}
        total={data?.total ?? 0}
        onPageChange={setPage}
        onPageSizeChange={(s) => {
          setPageSize(s)
          setPage(1)
        }}
        sort={sort}
        onSortChange={setSort}
        emptyState={
          <EmptyState
            icon={UserPlus}
            title="Çalışan bulunamadı"
            description={hasFilters ? 'Filtreleri değiştirmeyi deneyin.' : 'İlk çalışanı ekleyerek başlayın.'}
            action={
              canManage && !hasFilters ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing(null)
                    setFormOpen(true)
                  }}
                >
                  Çalışan ekle
                </Button>
              ) : undefined
            }
          />
        }
      />

      <StaffFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} />

      {/* Pasifleştir / Aktifleştir onayı */}
      <ConfirmDialog
        open={!!activeTarget}
        onOpenChange={(o) => !o && setActiveTarget(null)}
        title={activeTarget?.is_active ? 'Çalışanı pasifleştir' : 'Çalışanı aktifleştir'}
        description={
          activeTarget?.is_active
            ? `${activeTarget?.full_name} pasifleştirilecek ve sisteme giriş yapamayacak. Kayıt silinmez.`
            : `${activeTarget?.full_name} yeniden aktifleştirilecek ve giriş yapabilecek.`
        }
        confirmLabel={activeTarget?.is_active ? 'Pasifleştir' : 'Aktifleştir'}
        destructive={activeTarget?.is_active}
        onConfirm={async () => {
          if (!activeTarget) return
          try {
            await setActive.mutateAsync({ user_id: activeTarget.id, is_active: !activeTarget.is_active })
            toast.success('İşlem tamamlandı.')
            setActiveTarget(null)
          } catch (err) {
            toast.error(await toUserMessage(err))
          }
        }}
      />

      <ResetPasswordDialog target={resetTarget} onClose={() => setResetTarget(null)} />
    </div>
  )
}

function ResetPasswordDialog({ target, onClose }: { target: StaffRow | null; onClose: () => void }) {
  const [pw, setPw] = useState('')
  const reset = useResetStaffPassword()

  async function handle() {
    if (pw.length < 8) {
      toast.error('Şifre en az 8 karakter olmalı.')
      return
    }
    try {
      await reset.mutateAsync({ user_id: target!.id, new_password: pw })
      toast.success('Şifre sıfırlandı. Çalışan ilk girişte değiştirecek.')
      setPw('')
      onClose()
    } catch (err) {
      toast.error(await toUserMessage(err))
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && (setPw(''), onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Şifre sıfırla — {target?.full_name}</DialogTitle>
        </DialogHeader>
        <FormField label="Yeni geçici şifre" required hint="Çalışan ilk girişte değiştirecek (en az 8 karakter).">
          {(p) => <Input {...p} type="text" value={pw} onChange={(e) => setPw(e.target.value)} />}
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={() => (setPw(''), onClose())} disabled={reset.isPending}>
            Vazgeç
          </Button>
          <Button onClick={() => void handle()} disabled={reset.isPending}>
            {reset.isPending && <Loader2 className="size-4 animate-spin" />}
            Sıfırla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
