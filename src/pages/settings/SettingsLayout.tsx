import { NavLink, Outlet } from 'react-router-dom'
import {
  Users,
  Building2,
  Briefcase,
  Info,
  Shield,
  Lock,
  Clock,
  Cog,
  Bell,
  Hammer,
  MessageSquare,
  CheckCircle2,
  Radio,
  Flag,
  Tag,
  Globe2,
  Layers,
  GitBranch,
  Wallet,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Section {
  to: string
  label: string
  icon: LucideIcon
}
interface SectionGroup {
  title?: string
  items: Section[]
}

const GROUPS: SectionGroup[] = [
  {
    title: 'Organizasyon',
    items: [
      { to: '/ayarlar/calisanlar', label: 'Çalışanlar', icon: Users },
      { to: '/ayarlar/departmanlar', label: 'Departmanlar', icon: Building2 },
      { to: '/ayarlar/pozisyonlar', label: 'Pozisyonlar', icon: Briefcase },
    ],
  },
  {
    title: 'Satış Tanımları',
    items: [
      { to: '/ayarlar/kanallar', label: 'İletişim Kanalları', icon: MessageSquare },
      { to: '/ayarlar/sonuclar', label: 'Etkileşim Sonuçları', icon: CheckCircle2 },
      { to: '/ayarlar/kaynaklar', label: 'Kaynaklar', icon: Radio },
      { to: '/ayarlar/durumlar', label: 'Durumlar', icon: Flag },
      { to: '/ayarlar/etiketler', label: 'Etiketler', icon: Tag },
      { to: '/ayarlar/musteri-turleri', label: 'Müşteri Türleri', icon: Globe2 },
    ],
  },
  {
    title: 'Operasyon Tanımları',
    items: [
      { to: '/ayarlar/kategori-tur', label: 'Kategori / Tür', icon: Layers },
      { to: '/ayarlar/asamalar', label: 'Operasyon Aşamaları', icon: Hammer },
      { to: '/ayarlar/talep-durumlari', label: 'Talep Durumları', icon: Flag },
      { to: '/ayarlar/teklif-durumlari', label: 'Teklif Durumları', icon: Flag },
      { to: '/ayarlar/numune-durumlari', label: 'Numune Durumları', icon: Flag },
      { to: '/ayarlar/siparis-durumlari', label: 'Sipariş Durumları', icon: Flag },
      { to: '/ayarlar/talep-kanallari', label: 'Talep Kanalları', icon: Radio },
      { to: '/ayarlar/iptal-nedenleri', label: 'İptal Nedenleri', icon: Info },
      { to: '/ayarlar/red-nedenleri', label: 'Red Nedenleri', icon: Info },
      { to: '/ayarlar/odeme-kosullari', label: 'Ödeme Koşulları', icon: Info },
      { to: '/ayarlar/durum-gecisleri', label: 'Durum Geçişleri', icon: GitBranch },
    ],
  },
  {
    title: 'Sistem',
    items: [
      { to: '/ayarlar/sirket', label: 'Şirket Bilgileri', icon: Info },
      { to: '/ayarlar/guvenlik', label: 'Güvenlik', icon: Shield },
      { to: '/ayarlar/yetkiler', label: 'Roller & Yetkiler', icon: Lock },
      { to: '/ayarlar/calisma-duzeni', label: 'Çalışma Düzeni', icon: Clock },
      { to: '/ayarlar/bildirimler', label: 'Bildirimler', icon: Bell },
      { to: '/ayarlar/fiyatlandirma', label: 'Fiyatlandırma', icon: Tag },
      { to: '/ayarlar/finans', label: 'Finans', icon: Wallet },
      { to: '/ayarlar/yapay-zeka', label: 'Yapay Zekâ', icon: Sparkles },
      { to: '/ayarlar/sistem', label: 'Sistem', icon: Cog },
    ],
  },
]

/** Ayarlar bölümü — gruplu sol alt navigasyon + içerik. Yönetim ekranlarının çatısı. */
export function SettingsLayout() {
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <nav className="lg:w-56 lg:shrink-0">
        <div className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-4">
          {GROUPS.map((group) => (
            <div key={group.title} className="lg:space-y-1">
              {group.title && (
                <p className="text-text-muted hidden px-3 pt-2 text-xs font-semibold tracking-wide uppercase lg:block">
                  {group.title}
                </p>
              )}
              {group.items.map((s) => (
                <NavLink
                  key={s.to}
                  to={s.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors',
                      isActive
                        ? 'bg-card text-foreground font-medium shadow-card'
                        : 'text-text-secondary hover:bg-card/60 hover:text-foreground',
                    )
                  }
                >
                  <s.icon className="size-4 shrink-0" strokeWidth={1.75} />
                  {s.label}
                </NavLink>
              ))}
            </div>
          ))}
        </div>
      </nav>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}

/** Ayarlar alt bölümü için geçici yer tutucu. */
export function SettingsPlaceholder({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="bg-card flex size-14 items-center justify-center rounded-2xl border shadow-card">
        <Hammer className="text-accent-primary size-7" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-text-secondary">Bu bölüm bir sonraki adımda tamamlanacak.</p>
    </div>
  )
}
