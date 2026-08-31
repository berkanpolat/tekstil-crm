import {
  LayoutDashboard,
  Sparkles,
  Building2,
  Inbox,
  FileText,
  Shirt,
  ClipboardList,
  LayoutGrid,
  FolderClosed,
  Wallet,
  ListTodo,
  Target,
  BarChart3,
  MessageSquare,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  label: string
  path: string
  icon: LucideIcon
  /** Kısa açıklama (modülün ne işe yaradığı). */
  description: string
  /** Yalnızca owner/admin görür (ör. Ayarlar = kullanıcı yönetimi). */
  adminOnly?: boolean
  /** Yalnızca finans yetkili roller görür (P5.8). */
  financeOnly?: boolean
}

/** Kullanıcı yönetimi rolleri (owner/admin) — UI gate + Edge Function kontrolü. */
export const MANAGER_ROLES = ['owner', 'admin']
/** finance.view'e sahip roller (P5.8 + QA#1). sales finansal veri GÖRMEZ. */
export const FINANCE_ROLES = ['owner', 'admin', 'manager', 'finance']

export function canManageUsers(roleKey: string | null | undefined): boolean {
  return !!roleKey && MANAGER_ROLES.includes(roleKey)
}
export function canViewFinance(roleKey: string | null | undefined): boolean {
  return !!roleKey && FINANCE_ROLES.includes(roleKey)
}

/**
 * Ana menü. Yeni modül eklemek buraya bir satır eklemektir (veri odaklı).
 */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Gösterge Paneli', path: '/', icon: LayoutDashboard, description: 'Özet metrikler, bekleyen işler ve günlük akış.' },
  { label: 'Potansiyeller', path: '/potansiyeller', icon: Sparkles, description: 'Gelen potansiyel müşteriler ve mesajlaşma.' },
  { label: 'Mesajlar', path: '/mesajlar', icon: MessageSquare, description: 'WhatsApp gelen kutusu; potansiyel ve müşteri konuşmaları.' },
  { label: 'Müşteriler', path: '/musteriler', icon: Building2, description: 'Müşteri kartları, iletişim geçmişi ve zaman çizelgesi.' },
  { label: 'Talepler', path: '/talepler', icon: Inbox, description: 'Üretim talepleri; her talep bir operasyon koduyla doğar.' },
  { label: 'Teklifler', path: '/teklifler', icon: FileText, description: 'Fiyat teklifleri, sürümler ve sonuç takibi.' },
  { label: 'Numuneler', path: '/numuneler', icon: Shirt, description: 'Numune üretim, revizyon ve onay takibi.' },
  { label: 'Siparişler', path: '/siparisler', icon: ClipboardList, description: 'Onaylı siparişlerin üretim ve teslim süreci.' },
  { label: 'Katalog', path: '/katalog', icon: LayoutGrid, description: 'Ürün, kumaş ve fiyatlandırma kataloğu.' },
  { label: 'Belgeler', path: '/belgeler', icon: FolderClosed, description: 'Üretilen belgeler ve dosya arşivi.' },
  { label: 'Finans', path: '/finans', icon: Wallet, description: 'Cari hesaplar, ödemeler ve finansal takip.', financeOnly: true },
  { label: 'Görevler', path: '/gorevler', icon: ListTodo, description: 'Görevler, koordinasyon ve otomatik öneriler.' },
  { label: 'Hedefler', path: '/hedefler', icon: Target, description: 'Hedefler ve gerçekleşen ilerleme.' },
  { label: 'Raporlar', path: '/raporlar', icon: BarChart3, description: 'Grafikler, performans ve iş zekâsı raporları.' },
  { label: 'Ayarlar', path: '/ayarlar', icon: Settings, description: 'Çalışan, departman, pozisyon ve sistem ayarları.', adminOnly: true },
]

/** Verilen yol için aktif menü öğesini bulur (/ tam, diğerleri önek). */
export function activeNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) =>
    item.path === '/' ? pathname === '/' : pathname.startsWith(item.path),
  )
}
