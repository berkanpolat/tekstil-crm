import type { ReactNode } from 'react'

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
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="bg-navy flex size-12 items-center justify-center rounded-xl text-lg font-semibold text-white">
            T
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Tekstil A.Ş. CRM</h1>
          </div>
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
