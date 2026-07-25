import type { ReferenceTable } from '@/hooks/useReference'

export interface ReferenceConfig {
  table: ReferenceTable
  title: string
  description: string
  addLabel: string
  hasColor?: boolean
  hasPositive?: boolean
  hasClosed?: boolean
}

/** Satış Tanımları alt sayfaları (slug → config). */
export const REFERENCE_CONFIGS: Record<string, ReferenceConfig> = {
  kanallar: {
    table: 'interaction_channels',
    title: 'İletişim Kanalları',
    description: 'Etkileşimlerde kullanılan kanallar.',
    addLabel: 'Kanal ekle',
    hasColor: true,
  },
  sonuclar: {
    table: 'interaction_outcomes',
    title: 'Etkileşim Sonuçları',
    description: 'Görüşme sonuçları (olumlu bayrağı raporlamada kullanılır).',
    addLabel: 'Sonuç ekle',
    hasColor: true,
    hasPositive: true,
  },
  kaynaklar: {
    table: 'lead_sources',
    title: 'Potansiyel Kaynakları',
    description: 'Potansiyellerin geldiği kaynaklar.',
    addLabel: 'Kaynak ekle',
  },
  durumlar: {
    table: 'lead_statuses',
    title: 'Potansiyel Durumları',
    description: 'Potansiyel yaşam döngüsü durumları.',
    addLabel: 'Durum ekle',
    hasColor: true,
    hasClosed: true,
  },
  etiketler: {
    table: 'tags',
    title: 'Etiketler',
    description: 'Potansiyel ve müşterilere eklenebilen etiketler.',
    addLabel: 'Etiket ekle',
    hasColor: true,
  },
  'musteri-turleri': {
    table: 'customer_types',
    title: 'Müşteri Türleri',
    description: 'Yurtiçi / İhracat gibi müşteri türleri.',
    addLabel: 'Tür ekle',
  },
}
