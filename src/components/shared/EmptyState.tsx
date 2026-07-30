import type { ReactNode } from 'react'
import { Inbox, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  /** Ne yapılacağını söyleyen yönlendirici metin. "Kayıt bulunamadı" tek başına yetmez. */
  description?: string
  /** Yönlendirici aksiyon (buton vb.). */
  action?: ReactNode
  /** Dar alanlar (dialog/sekme) için küçük varyant. */
  compact?: boolean
}

/** Boş durum: metin + yönlendirici aksiyon (ne yapılacağını söyler). */
export function EmptyState({ icon: Icon = Inbox, title, description, action, compact }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-10')}>
      <div className={cn('bg-muted flex items-center justify-center rounded-full', compact ? 'size-9' : 'size-12')}>
        <Icon className={cn('text-text-muted', compact ? 'size-5' : 'size-6')} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="text-sm text-text-secondary">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
