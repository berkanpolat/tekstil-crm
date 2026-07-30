import { Users, ExternalLink } from 'lucide-react'
import { useDuplicateCheck } from '@/hooks/useSearch'

interface Props {
  company?: string | null
  phone?: string | null
  taxNumber?: string | null
  excludeType: 'lead' | 'customer'
  excludeId: number
}

/** Kart açılışında: aynı firma/telefon/vergi no'dan BAŞKA kayıtlar bandı. Engellemez. */
export function DuplicateBand({ company, phone, taxNumber, excludeType, excludeId }: Props) {
  const { data } = useDuplicateCheck({ company, phone, taxNumber, excludeType, excludeId }, true)
  if (!data || data.length === 0) return null

  return (
    <div className="border-warning/40 bg-warning/10 rounded-lg border px-4 py-2.5">
      <p className="text-foreground flex items-center gap-1.5 text-sm">
        <Users className="size-4 text-warning-foreground" />
        Aynı bilgilerle <span className="font-medium">{data.length}</span> başka kayıt var:
        {data.slice(0, 4).map((d) => (
          <a
            key={`${d.entity_type}-${d.id}`}
            href={d.entity_type === 'lead' ? `/potansiyeller/${d.id}` : `/musteriler/${d.id}`}
            target="_blank"
            rel="noreferrer"
            className="text-foreground hover:underline inline-flex items-center gap-0.5"
            title={`${d.entity_type === 'lead' ? 'Potansiyel' : 'Müşteri'} · ${d.reason}`}
          >
            {d.title ?? '—'}
            <ExternalLink className="size-3" />
          </a>
        ))}
        {data.length > 4 && <span className="text-text-muted">+{data.length - 4}</span>}
      </p>
    </div>
  )
}
