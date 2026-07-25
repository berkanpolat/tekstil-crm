import { NavLink } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen, LogOut, User as UserIcon, ChevronsUpDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { NAV_ITEMS } from '@/lib/navigation'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface SidebarProps {
  collapsed: boolean
  onToggleCollapse?: () => void
  /** Mobil çekmecede gezinince paneli kapatmak için. */
  onNavigate?: () => void
  /** Mobil çekmecede daraltma butonu gizlenir. */
  showCollapseButton?: boolean
}

export function Sidebar({
  collapsed,
  onToggleCollapse,
  onNavigate,
  showCollapseButton = true,
}: SidebarProps) {
  return (
    <aside className="bg-sidebar text-sidebar-foreground flex h-full flex-col">
      {/* Marka + daraltma */}
      <div className="flex h-16 items-center gap-2 px-4">
        <div className="bg-orange flex size-8 shrink-0 items-center justify-center rounded-lg font-semibold text-white">
          T
        </div>
        {!collapsed && (
          <span className="flex-1 truncate text-sm font-semibold text-white">Tekstil A.Ş.</span>
        )}
        {showCollapseButton && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hover:bg-sidebar-accent rounded-md p-1.5 text-white/70 transition-colors hover:text-white"
            aria-label={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        )}
      </div>

      {/* Menü */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
        {NAV_ITEMS.map((item) => {
          const link = (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-md border-l-[3px] py-2 pr-3 pl-[13px] text-sm transition-colors',
                  collapsed && 'justify-center pr-2 pl-2',
                  isActive
                    ? 'border-orange bg-sidebar-accent font-medium text-white'
                    : 'border-transparent text-white/70 hover:bg-sidebar-accent hover:text-white',
                )
              }
            >
              <item.icon className="size-[18px] shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          )
          return collapsed ? (
            <Tooltip key={item.path}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          ) : (
            link
          )
        })}
      </nav>

      {/* Kullanıcı bloğu */}
      <UserBlock collapsed={collapsed} />
    </aside>
  )
}

function UserBlock({ collapsed }: { collapsed: boolean }) {
  const { data: user } = useCurrentUser()
  const name = user?.full_name ?? 'Giriş yapılmadı'
  const sub = user?.department_name ?? (user ? user.email : 'Faz 0 — demo görünüm')
  const initials = (user?.full_name ?? '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="border-sidebar-border border-t p-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'hover:bg-sidebar-accent flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors',
              collapsed && 'justify-center',
            )}
          >
            <Avatar className="size-8 shrink-0">
              <AvatarFallback className="bg-orange/90 text-xs font-medium text-white">
                {initials || '?'}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{name}</p>
                  <p className="truncate text-xs text-white/50">{sub}</p>
                </div>
                <ChevronsUpDown className="size-4 shrink-0 text-white/40" />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-56">
          <DropdownMenuLabel className="truncate">{user?.email ?? 'Oturum yok'}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!user}>
            <UserIcon className="size-4" /> Profilim
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!user} onSelect={() => void supabase.auth.signOut()}>
            <LogOut className="size-4" /> Çıkış yap
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
