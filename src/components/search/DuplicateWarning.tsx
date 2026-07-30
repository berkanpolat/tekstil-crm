import { useEffect, useState } from 'react'
import { AlertTriangle, ExternalLink } from 'lucide-react'
import { useDuplicateCheck } from '@/hooks/useSearch'

interface Props {
  company?: string | null
  phone?: string | null
  taxNumber?: string | null
  excludeType?: 'lead' | 'customer' | null
  excludeId?: number | null
}

/** Mükerrer aday uyarısı — aynı firma/telefon/vergi no. Engellemez; kullanıcı karar verir. */
export function DuplicateWarning({ company, phone, taxNumber, excludeType, excludeId }: Props) {
  const [deb, setDeb] = useState({ company, phone, taxNumber })
  useEffect(() => {
    const t = setTimeout(() => setDeb({ company, phone, taxNumber }), 400)
    return () => clearTimeout(t)
  }, [company, phone, taxNumber])

  const { data } = useDuplicateCheck(
    { company: deb.company, phone: deb.phone, taxNumber: deb.taxNumber, excludeType, excludeId },
    true,
  )
  if (!data || data.length === 0) return null

  return (
    <div className="border-warning/40 bg-warning/10 rounded-lg border p-3">
      <p className="text-foreground flex items-center gap-1.5 text-sm font-medium">
        <AlertTriangle className="size-4 text-warning-foreground" />
        Olası mükerrer ({data.length}) — aynı bilgilerle kayıt var. Kontrol edin.
      </p>
      <ul className="mt-2 space-y-1">
        {data.slice(0, 5).map((d) => (
          <li key={`${d.entity_type}-${d.id}`} className="text-sm">
            <a
              href={d.entity_type === 'lead' ? `/potansiyeller/${d.id}` : `/musteriler/${d.id}`}
              target="_blank"
              rel="noreferrer"
              className="text-foreground hover:underline inline-flex items-center gap-1"
            >
              {d.code && <span className="text-text-muted font-mono text-xs">{d.code}</span>}
              {d.title ?? '—'}
              <ExternalLink className="size-3" />
            </a>
            <span className="text-text-muted ml-2 text-xs">
              {d.entity_type === 'lead' ? 'Potansiyel' : 'Müşteri'} · {d.reason}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
