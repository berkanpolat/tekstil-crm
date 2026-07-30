import { useState } from 'react'
import { Loader2, Trash2, StickyNote } from 'lucide-react'
import { toast } from 'sonner'
import { toUserMessage } from '@/lib/errors'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { useNotes, useAddNote, useDeleteNote, type NoteEntity } from '@/hooks/useNotes'

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function NotesPanel({ entityType, entityId }: { entityType: NoteEntity; entityId: number }) {
  const { data: notes, isLoading } = useNotes(entityType, entityId)
  const add = useAddNote()
  const del = useDeleteNote()
  const [body, setBody] = useState('')

  async function submit() {
    if (!body.trim()) return
    try {
      await add.mutateAsync({ entity_type: entityType, entity_id: entityId, body: body.trim() })
      setBody('')
      toast.success('Not eklendi.')
    } catch (err) {
      toast.error(await toUserMessage(err))
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="space-y-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Not ekle…"
          rows={3}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={() => void submit()} disabled={add.isPending || !body.trim()}>
            {add.isPending && <Loader2 className="size-4 animate-spin" />} Not ekle
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (notes ?? []).length === 0 ? (
        <EmptyState icon={StickyNote} title="Not yok" description="İlk notu yukarıdan ekleyin." />
      ) : (
        <ul className="space-y-2">
          {(notes ?? []).map((n) => (
            <li key={n.id} className="border-border rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-sm whitespace-pre-wrap text-foreground">{n.body}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={del.isPending}
                  onClick={async () => {
                    try {
                      await del.mutateAsync(n)
                    } catch (err) {
                      toast.error(await toUserMessage(err))
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <p className="text-text-muted mt-1 text-xs">
                {n.author_name ?? 'Bilinmiyor'} · {fmt(n.created_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
