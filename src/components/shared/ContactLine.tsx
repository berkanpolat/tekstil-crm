import { Phone, Mail, MessageCircle, AtSign, Send, Globe, type LucideIcon } from 'lucide-react'
import { contactHref, contactDisplay } from '@/lib/phone'

export type ContactKind = 'phone' | 'whatsapp' | 'email' | 'instagram' | 'telegram' | 'website'

const ICON: Record<ContactKind, LucideIcon> = {
  phone: Phone, whatsapp: MessageCircle, email: Mail, instagram: AtSign, telegram: Send, website: Globe,
}
const LABEL: Record<ContactKind, string> = {
  phone: 'Telefon', whatsapp: 'WhatsApp', email: 'E-posta', instagram: 'Instagram', telegram: 'Telegram', website: 'Web sitesi',
}

/** İletişim noktası — ikon + tıklanabilir bağlantı (yeni sekmede). Bilinmeyen tip düz metin. */
export function ContactLine({ type, value, className }: { type: string; value: string; className?: string }) {
  const kind = (['phone', 'whatsapp', 'email', 'instagram', 'telegram', 'website'].includes(type) ? type : null) as ContactKind | null
  const Icon = kind ? ICON[kind] : Globe
  const href = kind ? contactHref(kind, value) : null
  const text = kind ? contactDisplay(kind, value) : value
  return (
    <span className={className}>
      <Icon className="text-text-muted mr-1.5 inline size-3.5 shrink-0 align-text-bottom" aria-label={kind ? LABEL[kind] : type} />
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
          {text}
        </a>
      ) : (
        <span className="text-foreground">{text}</span>
      )}
    </span>
  )
}

/** Sadece ikon (liste görünümü için) — değeri tıklanabilir küçük ikon. */
export function ContactIcon({ type, value }: { type: string; value: string }) {
  const kind = (['phone', 'whatsapp', 'email', 'instagram', 'telegram', 'website'].includes(type) ? type : null) as ContactKind | null
  if (!kind) return null
  const Icon = ICON[kind]
  const href = contactHref(kind, value)
  if (!href) return null
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title={`${LABEL[kind]}: ${contactDisplay(kind, value)}`}
      onClick={(e) => e.stopPropagation()} className="text-text-muted hover:text-primary">
      <Icon className="size-4" />
    </a>
  )
}
