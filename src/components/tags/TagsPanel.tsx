import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { toUserMessage } from '@/lib/errors'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { cn } from '@/lib/utils'
import { STATUS_TONE_CLASS, type StatusTone } from '@/lib/statuses'
import {
  useTagOptions,
  useEntityTags,
  useAddEntityTag,
  useRemoveEntityTag,
  type TagEntity,
} from '@/hooks/useTags'
import { useState } from 'react'

const TONE_SET = new Set(['success', 'warning', 'danger', 'info', 'neutral'])
const toneClass = (color: string | null) =>
  color && TONE_SET.has(color) ? STATUS_TONE_CLASS[color as StatusTone] : 'bg-neutral-badge text-neutral-badge-foreground'

/** Etiket çipleri + ekle/çıkar. entity_tags trigger'ı timeline'a tag.added/removed yazar. */
export function TagsPanel({ entityType, entityId }: { entityType: TagEntity; entityId: number }) {
  const { data: tags } = useEntityTags(entityType, entityId)
  const options = useTagOptions()
  const addTag = useAddEntityTag()
  const removeTag = useRemoveEntityTag()
  const [picking, setPicking] = useState(false)

  const usedTagIds = new Set((tags ?? []).map((t) => t.tag_id))
  const available = (options.data ?? []).filter((o) => !usedTagIds.has(o.id))

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {(tags ?? []).map((t) => (
        <span
          key={t.id}
          className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium', toneClass(t.color))}
        >
          {t.label}
          <button
            type="button"
            aria-label={`${t.label} etiketini kaldır`}
            onClick={async () => {
              try {
                await removeTag.mutateAsync({ id: t.id, entity_type: entityType, entity_id: entityId })
              } catch (err) {
                toast.error(await toUserMessage(err))
              }
            }}
            className="hover:opacity-70"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}

      {picking ? (
        <SearchableSelect
          options={available.map((o) => ({ value: String(o.id), label: o.label }))}
          value={null}
          onChange={async (v) => {
            setPicking(false)
            if (!v) return
            try {
              await addTag.mutateAsync({ entity_type: entityType, entity_id: entityId, tag_id: Number(v) })
            } catch (err) {
              toast.error(await toUserMessage(err))
            }
          }}
          placeholder="Etiket seç"
          className="w-40"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="text-text-secondary hover:text-foreground border-border inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-0.5 text-xs"
        >
          <Plus className="size-3" /> Etiket
        </button>
      )}
    </div>
  )
}
