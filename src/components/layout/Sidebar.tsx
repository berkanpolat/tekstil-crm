import { NavLink } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen, LogOut, User as UserIcon, MoreVertical } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { NAV_ITEMS, canManageUsers } from '@/lib/navigation'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/shared/Logo'
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
  onNavigate?: () => void
  showCollapseButton?: boolean
}

const ICON_STROKE = 1.75

export function Sidebar({
  collapsed,
  onToggleCollapse,
  onNavigate,
  showCollapseButton = true,
}: SidebarProps) {
  const { data: me } = useCurrentUser()
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || canManageUsers(me?.role_key))
  return (
    <aside className="bg-sidebar text-sidebar-foreground flex h-full flex-col">
      {/* Logo + daraltma */}
      <div className="flex h-16 items-center gap-2 px-3">
        {collapsed ? (
          <Logo variant="light" symbolOnly className="mx-auto h-7" />
        ) : (
          <Logo variant="light" className="ml-1 h-7" />
        )}
        {showCollapseButton && !collapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hover:bg-sidebar-hover ml-auto rounded-md p-1.5 text-white/60 transition-colors hover:text-white"
            aria-label="Menüyü daralt"
          >
            <PanelLeftClose className="size-4" strokeWidth={ICON_STROKE} />
          </button>
        )}
      </div>
      {showCollapseButton && collapsed && (
        <button
          type="button"
          onClick={onToggleCollapse}
          className="hover:bg-sidebar-hover mx-2 mb-1 rounded-md p-1.5 text-white/60 transition-colors hover:text-white"
          aria-label="Menüyü genişlet"
        >
          <PanelLeftOpen className="mx-auto size-4" strokeWidth={ICON_STROKE} />
        </button>
      )}

      {/* Menü */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
        {items.map((item) => {
          const link = (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  collapsed && 'justify-center px-2',
                  isActive
                    ? 'bg-sidebar-active text-sidebar-foreground-active font-medium'
                    : 'hover:bg-sidebar-hover hover:text-sidebar-foreground-active',
                )
              }
            >
              <item.icon className="size-[18px] shrink-0" strokeWidth={ICON_STROKE} />
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

      <UserBlock collapsed={collapsed} />
    </aside>
  )
}

function UserBlock({ collapsed }: { collapsed: boolean }) {
  const { data: user } = useCurrentUser()
  const { signOut } = useAuth()
  const name = user?.full_name ?? 'Giriş yapılmadı'
  const sub = user?.email ?? 'Faz 0 — demo görünüm'
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
              'hover:bg-sidebar-hover flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors',
              collapsed && 'justify-center',
            )}
          >
            <span className="bg-accent-primary flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white">
              {initials || '?'}
            </span>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="text-sidebar-foreground-active truncate text-sm font-medium">{name}</p>
                  <p className="truncate text-xs text-white/45">{sub}</p>
                </div>
                <MoreVertical className="size-4 shrink-0 text-white/40" strokeWidth={ICON_STROKE} />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-56">
          <DropdownMenuLabel className="truncate">{user?.email ?? 'Oturum yok'}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild disabled={!user}>
            <a href="/profil">
              <UserIcon className="size-4" /> Profilim
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!user} onSelect={() => void signOut()}>
            <LogOut className="size-4" /> Çıkış yap
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
