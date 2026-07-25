import type { ReactNode } from 'react'
import { Logo } from '@/components/shared/Logo'

/** Kimlik ekranları için ortak, markalı, ortalanmış kabuk. */
export function AuthShell({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="bg-page flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo variant="dark" className="h-9" />
        </div>
        <div className="bg-card rounded-xl border p-6 shadow-card">
          <div className="mb-4 space-y-1">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {description && <p className="text-sm text-text-secondary">{description}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
