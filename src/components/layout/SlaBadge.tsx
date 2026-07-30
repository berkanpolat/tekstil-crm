import { Link } from 'react-router-dom'
import { AlertTriangle, Inbox } from 'lucide-react'
import { useOpenFileCounts } from '@/hooks/useOpenFiles'
import { useCurrentUser } from '@/hooks/useCurrentUser'

/**
 * Havuz modeli rozeti (B.7): toplam değil — BANA ait AÇIK DOSYALAR (süresi dolmuş/bugün)
 * ayrı, SAHİPSİZ havuz dosyaları ayrı. Kaynak: open_files (H1 sla_deadline yerini aldı).
 */
export function SlaBadge() {
  const { data: me } = useCurrentUser()
  const { data } = useOpenFileCounts(me?.id)
  const mine = data?.mine ?? 0
  const unassigned = data?.unassigned ?? 0
  if (mine === 0 && unassigned === 0) return null

  return (
    <div className="flex items-center gap-2">
      {mine > 0 && (
        <Link to="/talepler?view=acik-dosyalarim" title="Bana ait, süresi dolan/dolacak açık dosyalar"
          className="bg-danger-badge text-danger-badge-foreground flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium">
          <AlertTriangle className="size-3.5" /> {mine} açık dosyanız
        </Link>
      )}
      {unassigned > 0 && (
        <Link to="/talepler?view=sahipsiz" title="Sahipsiz havuz dosyaları — üstlenmeyi bekliyor"
          className="bg-warning-badge text-warning-badge-foreground flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium">
          <Inbox className="size-3.5" /> {unassigned} sahipsiz talep
        </Link>
      )}
    </div>
  )
}
