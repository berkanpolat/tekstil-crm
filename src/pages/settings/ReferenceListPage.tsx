import { useState } from 'react'
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
import { STATUS_TONE_CLASS, type StatusTone } from '@/lib/statuses'
import { toUserMessage } from '@/lib/errors'
import {
  useReferenceList,
  useSaveReference,
  useSetReferenceActive,
  type ReferenceRow,
} from '@/hooks/useReference'
import type { ReferenceConfig } from './referenceConfigs'
import { cn } from '@/lib/utils'

const TONE_OPTIONS: { value: StatusTone; label: string }[] = [
  { value: 'info', label: 'Mor' },
  { value: 'success', label: 'Yeşil' },
  { value: 'warning', label: 'Amber' },
  { value: 'danger', label: 'Kırmızı' },
  { value: 'neutral', label: 'Gri' },
]

function ToneBadge({ tone, label }: { tone: string | null; label: string }) {
  const cls = STATUS_TONE_CLASS[(tone as StatusTone) ?? 'neutral'] ?? STATUS_TONE_CLASS.neutral
  return <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', cls)}>{label}</span>
}

export function ReferenceListPage({ config }: { config: ReferenceConfig }) {
  const { data, isLoading } = useReferenceList(config.table)
  const setActive = useSetReferenceActive(config.table)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ReferenceRow | null>(null)
  const [toggleTarget, setToggleTarget] = useState<ReferenceRow | null>(null)

  const columns: DataTableColumn<ReferenceRow>[] = [
    {
      key: 'label',
      header: 'Tanım',
      cell: (r) =>
        config.hasColor ? (
          <ToneBadge tone={r.color} label={r.label} />
        ) : (
          <div>
            <div className="text-sm font-medium text-foreground">{r.label}</div>
            <div className="text-text-secondary text-xs">{r.key}</div>
          </div>
        ),
    },
    { key: 'key', header: 'Anahtar', hideable: true, cell: (r) => <code className="text-text-secondary text-xs">{r.key}</code> },
    { key: 'sort', header: 'Sıra', align: 'center', hideable: true, cell: (r) => r.sort_order },
    ...(config.hasPositive
      ? [{ key: 'positive', header: 'Olumlu', align: 'center' as const, cell: (r: ReferenceRow) => (r.is_positive ? 'Evet' : '—') }]
      : []),
    ...(config.hasClosed
      ? [{ key: 'closed', header: 'Kapanış', align: 'center' as const, cell: (r: ReferenceRow) => (r.is_closed ? 'Evet' : '—') }]
      : []),
    { key: 'status', header: 'Durum', cell: (r) => <StatusBadge status={r.is_active ? 'active' : 'inactive'} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => (setEditing(r), setFormOpen(true))}>
              <Pencil className="size-4" /> Düzenle
            </DropdownMenuItem>
            {/* Sistem tanımları pasifleştirilemez (silinemez zaten). */}
            {!r.is_system && (
              <DropdownMenuItem onSelect={() => setToggleTarget(r)}>
                <Power className="size-4" /> {r.is_active ? 'Pasifleştir' : 'Aktifleştir'}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title={config.title}
        description={config.description}
        action={
          <Button onClick={() => (setEditing(null), setFormOpen(true))}>
            <Plus className="size-4" /> {config.addLabel}
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={data ?? []}
        rowKey={(r) => String(r.id)}
        loading={isLoading}
        page={1}
        pageSize={200}
        total={data?.length ?? 0}
        onPageChange={() => {}}
        emptyState={<EmptyState title="Kayıt yok" description="İlk tanımı ekleyin." />}
      />

      <ReferenceFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} config={config} />

      <ConfirmDialog
        open={!!toggleTarget}
        onOpenChange={(o) => !o && setToggleTarget(null)}
        title={toggleTarget?.is_active ? 'Tanımı pasifleştir' : 'Tanımı aktifleştir'}
        description={
          toggleTarget?.is_active
            ? `"${toggleTarget?.label}" pasifleştirilecek; yeni kayıtlarda seçilemez. Mevcut kullanımlar korunur.`
            : `"${toggleTarget?.label}" yeniden aktifleştirilecek.`
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

function ReferenceFormDialog({
  open,
  onOpenChange,
  editing,
  config,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: ReferenceRow | null
  config: ReferenceConfig
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Tanımı düzenle' : config.addLabel}</DialogTitle>
        </DialogHeader>
        {open && (
          <ReferenceForm key={editing?.id ?? 'new'} editing={editing} config={config} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ReferenceForm({
  editing,
  config,
  onDone,
}: {
  editing: ReferenceRow | null
  config: ReferenceConfig
  onDone: () => void
}) {
  const [label, setLabel] = useState(editing?.label ?? '')
  const [key, setKey] = useState(editing?.key ?? '')
  const [sortOrder, setSortOrder] = useState(String(editing?.sort_order ?? 0))
  const [color, setColor] = useState<string | null>(editing?.color ?? 'neutral')
  const [isPositive, setIsPositive] = useState(editing?.is_positive ?? false)
  const [isClosed, setIsClosed] = useState(editing?.is_closed ?? false)
  const save = useSaveReference(config.table)
  const keyLocked = !!editing?.is_system

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const normKey = key.trim().toLowerCase().replace(/\s+/g, '_')
    if (!normKey) return toast.error('Anahtar (key) zorunludur.')
    try {
      await save.mutateAsync({
        id: editing?.id,
        key: normKey,
        label: label.trim(),
        sort_order: Number(sortOrder) || 0,
        color: config.hasColor ? color : (editing?.color ?? null),
        ...(config.hasPositive ? { is_positive: isPositive } : {}),
        ...(config.hasClosed ? { is_closed: isClosed } : {}),
        is_active: editing?.is_active ?? true,
      })
      toast.success(editing ? 'Güncellendi.' : 'Eklendi.')
      onDone()
    } catch (err) {
      toast.error(await toUserMessage(err))
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormField label="Etiket (görünen ad)" required>
        {(p) => <Input {...p} value={label} onChange={(e) => setLabel(e.target.value)} required />}
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Anahtar (key)" required hint={keyLocked ? 'Sistem tanımı — değişmez.' : 'küçük harf, boşluksuz'}>
          {(p) => <Input {...p} value={key} onChange={(e) => setKey(e.target.value)} disabled={keyLocked} required />}
        </FormField>
        <FormField label="Sıra">
          {(p) => <Input {...p} type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />}
        </FormField>
      </div>
      {config.hasColor && (
        <FormField label="Renk">
          {(p) => (
            <SearchableSelect
              id={p.id}
              options={TONE_OPTIONS.map((t) => ({ value: t.value, label: t.label }))}
              value={color}
              onChange={setColor}
              placeholder="Renk seçin"
            />
          )}
        </FormField>
      )}
      {config.hasPositive && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={isPositive} onCheckedChange={(c) => setIsPositive(!!c)} /> Olumlu sonuç (raporlama)
        </label>
      )}
      {config.hasClosed && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={isClosed} onCheckedChange={(c) => setIsClosed(!!c)} /> Kapanış durumu
        </label>
      )}
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
