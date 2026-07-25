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
  BarChart3,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  label: string
  path: string
  icon: LucideIcon
  /** Yer tutucu sayfada gösterilecek kısa açıklama (ne işe yarayacağı). */
  description: string
  /** Hangi fazda geleceği. */
  arrives: string
}

/**
 * Faz 0 menüsü. Sayfalar sonraki fazlarda dolacak; şimdilik yer tutucu bilgi
 * kartları. Yeni modül eklemek buraya bir satır eklemektir (veri odaklı).
 */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Gösterge Paneli', path: '/', icon: LayoutDashboard, description: 'Özet metrikler, bekleyen işler ve günlük akış.', arrives: 'Faz 7' },
  { label: 'Potansiyeller', path: '/potansiyeller', icon: Sparkles, description: 'Gelen potansiyel müşteriler ve mesajlaşma (TekLead).', arrives: 'Faz 2' },
  { label: 'Müşteriler', path: '/musteriler', icon: Building2, description: 'Müşteri kartları, iletişim geçmişi ve zaman çizelgesi.', arrives: 'Faz 1' },
  { label: 'Talepler', path: '/talepler', icon: Inbox, description: 'Üretim talepleri; her talep bir operasyon koduyla doğar.', arrives: 'Faz 3' },
  { label: 'Teklifler', path: '/teklifler', icon: FileText, description: 'Fiyat teklifleri, sürümler ve onay akışı.', arrives: 'Faz 4' },
  { label: 'Numuneler', path: '/numuneler', icon: Shirt, description: 'Numune üretim ve onay takibi.', arrives: 'Faz 4' },
  { label: 'Siparişler', path: '/siparisler', icon: ClipboardList, description: 'Onaylı siparişlerin üretim ve teslim süreci.', arrives: 'Faz 5' },
  { label: 'Katalog', path: '/katalog', icon: LayoutGrid, description: 'Ürün, kumaş ve fiyatlandırma kataloğu.', arrives: 'Faz 4' },
  { label: 'Belgeler', path: '/belgeler', icon: FolderClosed, description: 'Üretilen belgeler ve dosya arşivi.', arrives: 'Faz 4' },
  { label: 'Finans', path: '/finans', icon: Wallet, description: 'Cari hesaplar, ödemeler ve finansal takip.', arrives: 'Faz 6' },
  { label: 'Görevler', path: '/gorevler', icon: ListTodo, description: 'Görevler, hedefler ve bildirimler.', arrives: 'Faz 6' },
  { label: 'Raporlar', path: '/raporlar', icon: BarChart3, description: 'Grafikler, performans ve iş zekâsı raporları.', arrives: 'Faz 7' },
  { label: 'Ayarlar', path: '/ayarlar', icon: Settings, description: 'Şirket bilgileri, güvenlik, çalışma düzeni ve sistem ayarları.', arrives: 'Faz 0 (arayüz yakında)' },
]

/** Verilen yol için aktif menü öğesini bulur (/ tam, diğerleri önek). */
export function activeNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) =>
    item.path === '/' ? pathname === '/' : pathname.startsWith(item.path),
  )
}
