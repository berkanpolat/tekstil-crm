import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PageHeaderProps {
  title: string
  description?: string
  /** Sağdaki birincil aksiyon (buton vb.). */
  action?: ReactNode
  /** Geri butonu hedefi (-1 = tarayıcı geçmişi). */
  backTo?: string | number
}

/** Sayfa başlığı: başlık, açıklama, birincil aksiyon, geri butonu. */
export function PageHeader({ title, description, action, backTo }: PageHeaderProps) {
  const navigate = useNavigate()
  return (
    <div className="mb-5 flex items-start gap-3">
      {backTo !== undefined && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="mt-0.5 shrink-0"
          onClick={() => (typeof backTo === 'number' ? navigate(backTo) : navigate(backTo))}
          aria-label="Geri"
        >
          <ArrowLeft className="size-4" />
        </Button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  )
}
