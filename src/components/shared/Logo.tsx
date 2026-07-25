import logoFullLight from '@/assets/logo/logo-full-light.svg'
import logoFullDark from '@/assets/logo/logo-full-dark.svg'
import logoSymbolLight from '@/assets/logo/logo-symbol-light.svg'
import logoSymbolDark from '@/assets/logo/logo-symbol-dark.svg'
import { cn } from '@/lib/utils'

interface LogoProps {
  /** light = beyaz logo (koyu zemin, ör. sidebar); dark = lacivert logo (açık zemin, ör. giriş). */
  variant?: 'light' | 'dark'
  /** Yalnızca sembol (ör. daraltılmış sidebar). */
  symbolOnly?: boolean
  className?: string
}

/** Kurumsal logo — tek yerden, tutarlı kullanım. 6.19:1 yatay lockup. */
export function Logo({ variant = 'dark', symbolOnly = false, className }: LogoProps) {
  const src = symbolOnly
    ? variant === 'light'
      ? logoSymbolLight
      : logoSymbolDark
    : variant === 'light'
      ? logoFullLight
      : logoFullDark
  return (
    <img src={src} alt="Tekstil A.Ş." draggable={false} className={cn('block w-auto', className)} />
  )
}
