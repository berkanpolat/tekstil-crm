import type { ReactNode } from 'react'
import { useId } from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface FormFieldProps {
  label: string
  /** Alt yardım metni. */
  hint?: string
  /** Hata metni (varsa alanı kırmızıya boyar). */
  error?: string
  required?: boolean
  className?: string
  /** children: input/select vb. `id` prop'u otomatik bağlanır. */
  children: (props: { id: string; 'aria-invalid': boolean }) => ReactNode
}

/** Form alanı sarmalayıcısı: etiket, yardım, hata, zorunluluk göstergesi — tek yer. */
export function FormField({ label, hint, error, required, className, children }: FormFieldProps) {
  const id = useId()
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children({ id, 'aria-invalid': !!error })}
      {error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : hint ? (
        <p className="text-text-muted text-xs">{hint}</p>
      ) : null}
    </div>
  )
}
