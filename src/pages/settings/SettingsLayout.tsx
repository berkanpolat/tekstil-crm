import { NavLink, Outlet } from 'react-router-dom'
import { Users, Building2, Briefcase, Info, Shield, Clock, Cog, Hammer } from 'lucide-react'
import { cn } from '@/lib/utils'

const SECTIONS = [
  { to: '/ayarlar/calisanlar', label: 'Çalışanlar', icon: Users },
  { to: '/ayarlar/departmanlar', label: 'Departmanlar', icon: Building2 },
  { to: '/ayarlar/pozisyonlar', label: 'Pozisyonlar', icon: Briefcase },
  { to: '/ayarlar/sirket', label: 'Şirket Bilgileri', icon: Info },
  { to: '/ayarlar/guvenlik', label: 'Güvenlik', icon: Shield },
  { to: '/ayarlar/calisma-duzeni', label: 'Çalışma Düzeni', icon: Clock },
  { to: '/ayarlar/sistem', label: 'Sistem', icon: Cog },
]

/** Ayarlar bölümü — sol alt navigasyon + içerik. Yönetim ekranlarının çatısı. */
export function SettingsLayout() {
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <nav className="flex gap-1 overflow-x-auto lg:w-56 lg:shrink-0 lg:flex-col">
        {SECTIONS.map((s) => (
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
            <s.icon className="size-4 shrink-0" />
            {s.label}
          </NavLink>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}

/** Ayarlar alt bölümü için geçici yer tutucu (sonraki adımda dolacak). */
export function SettingsPlaceholder({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="bg-card flex size-14 items-center justify-center rounded-2xl border shadow-card">
        <Hammer className="text-orange size-7" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-text-secondary">Bu bölüm bir sonraki adımda tamamlanacak.</p>
    </div>
  )
}
